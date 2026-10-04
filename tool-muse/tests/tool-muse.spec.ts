import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus, Inbox, InboxTarget } from '@deepseek-ai/dsh-agent'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { MessageSource } from '@deepseek-ai/dsh-llm'
import { latestAutonomy, MuseIntentError } from '@deepseek-ai/dsh-muse'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as toolMuse from '../src/index.ts'

const testToolSignal = new AbortController().signal

interface StubAgent {
  readonly agent: Agent
  readonly session: Session
  setStatus(status: AgentStatus): void
}

/** One in-memory Inbox over pending lists, plus the claim the old host class exposed. */
function stubInbox(): Inbox & { claim(target: InboxTarget): Inbox['nextTurn'] } {
  const pending: Record<InboxTarget, Inbox['nextTurn']> = { 'next-turn': [], 'next-step': [] }
  return {
    get nextTurn() { return pending['next-turn'] },
    get nextStep() { return pending['next-step'] },
    append(target, message) { pending[target] = [...pending[target], message] },
    prepend(target, message) { pending[target] = [message, ...pending[target]] },
    replace(messageId, newMessage) {
      for (const target of ['next-turn', 'next-step'] as const) {
        const index = pending[target].findIndex(message => message.id === messageId)
        if (index >= 0) {
          pending[target] = pending[target].with(index, newMessage)
          return true
        }
      }
      return false
    },
    remove(messageId) {
      for (const target of ['next-turn', 'next-step'] as const) {
        const index = pending[target].findIndex(message => message.id === messageId)
        if (index >= 0) {
          pending[target] = pending[target].toSpliced(index, 1)
          return true
        }
      }
      return false
    },
    splice(target, start, deleteCount, inserted) {
      const removed = pending[target].slice(start, start + deleteCount)
      pending[target] = pending[target].toSpliced(start, deleteCount, ...inserted)
      return removed
    },
    clear() {
      pending['next-step'] = []
      pending['next-turn'] = []
    },
    claim(target) {
      const claimed = pending[target]
      pending[target] = []
      return claimed
    },
  }
}

/** Build one registry-compatible live agent whose injections enter the durable inbox. */
function stubAgent(rawId: string): StubAgent {
  const session = Session.create(SessionId(rawId))
  let status: AgentStatus = 'running'
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox: stubInbox(),
    get status() { return status },
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject(input) {
      this.inbox.append('next-step', input)
    },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  return { agent, session, setStatus(value) { status = value } }
}

/** Open one message-triggered turn with its accepted model-visible input. */
function openTurn(stub: StubAgent, source: MessageSource, text = 'prompt'): number {
  const turn = stub.session.snapshotEvents()
    .filter(event => event.type === 'turn/start')
    .reduce((max, event) => Math.max(max, event.data.turn), 0) + 1
  const message = createUserMessage({
    content: [{ type: 'text', text }],
    source,
  })
  stub.agent.inbox.append('next-turn', message)
  const claimed = stub.agent.inbox.claim('next-turn', turn)
  if (claimed.length === 0) throw new Error('expected queued turn input')
  stub.session.append('turn/start', { turn })
  for (const admitted of claimed) {
    stub.session.append('user/message', admitted, { surfaceOp: 'append' })
  }
  return turn
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ToolRuntime)
  const fiber = await ctx.plugin(toolMuse)
  const root = stubAgent(`muse-tool-root-${Math.random()}`)
  ctx.agents.register(root.agent)
  return { ctx, fiber, root }
}

/** Execute one registered tool under an optional driver initiator. */
async function execute(
  ctx: Context,
  args: unknown,
  agent?: Agent,
  initiator: Agent | undefined = agent,
): Promise<ToolExecutionResult> {
  const run = () => ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId(`call-${Math.random()}`),
    name: 'muse_autonomy',
    arguments: args,
    ...agent === undefined ? {} : { agent },
  })
  return initiator === undefined ? run() : ctx.agents.withInitiator(initiator, run)
}

describe('muse_autonomy tool', () => {
  it('has the Loader-safe function-plugin export shape', () => {
    expect('default' in toolMuse).toBe(false)
    expect(toolMuse.name).toBe('tool-muse')
    expect(toolMuse.inject).toEqual(['agents', 'tools'])
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(toolMuse)).toBe(toolMuse)
  })

  it('records a durable latest-wins intent under direct human authority', async () => {
    const { ctx, root } = await harness()
    openTurn(root, { kind: 'user' }, 'keep pushing this until done')

    const first = await execute(ctx, { autonomy: true }, root.agent)
    expect(first.isError).toBe(false)
    if (first.isError) throw new Error('expected muse_autonomy success')
    expect(first.value).toEqual({ autonomy: true })
    expect(latestAutonomy(root.session.snapshotEvents())).toBe(true)

    const second = await execute(ctx, { autonomy: false }, root.agent)
    expect(second.isError).toBe(false)
    if (second.isError) throw new Error('expected muse_autonomy success')
    expect(latestAutonomy(root.session.snapshotEvents())).toBe(false)
  })

  it('rejects non-human sources, non-root agents, and driverless calls', async () => {
    const { ctx, root } = await harness()

    /* An automatic plugin-source message carries no human authority. */
    openTurn(root, { kind: 'plugin', plugin: 'tool-muse-test' })
    const nonHuman = await execute(ctx, { autonomy: true }, root.agent)
    expect(nonHuman.isError).toBe(true)
    expect(latestAutonomy(root.session.snapshotEvents())).toBeUndefined()

    /* A child agent is never a valid grantor even with human text. */
    const child = stubAgent(`muse-tool-child-${Math.random()}`)
    ctx.agents.register(child.agent)
    openTurn(child, { kind: 'user' })
    const childResult = await execute(ctx, { autonomy: true }, child.agent, root.agent)
    expect(childResult.isError).toBe(true)
    expect(latestAutonomy(child.session.snapshotEvents())).toBeUndefined()

    /* No open turn means no driver boundary at all. */
    const driverless = await execute(ctx, { autonomy: true }, root.agent)
    expect(driverless.isError).toBe(true)
    expect(latestAutonomy(root.session.snapshotEvents())).toBeUndefined()
  })

  it('rejects closed turns, eventless sessions, and agentless calls', async () => {
    const { ctx, root } = await harness()

    const turn = openTurn(root, { kind: 'user' })
    root.session.append('turn/end', { turn, reason: { kind: 'completed' } })
    const closed = await execute(ctx, { autonomy: true }, root.agent)
    expect(closed.isError).toBe(true)

    const eventless = stubAgent(`muse-tool-eventless-${Math.random()}`)
    ctx.agents.register(eventless.agent)
    const noTurn = await execute(ctx, { autonomy: true }, eventless.agent)
    expect(noTurn.isError).toBe(true)

    const agentless = await execute(ctx, { autonomy: true })
    expect(agentless.isError).toBe(true)
  })

  it('presents the call card from the args', async () => {
    const { ctx } = await harness()
    const tool = ctx.tools.get('muse_autonomy')
    if (tool === undefined) throw new Error('expected muse_autonomy registration')
    const view = tool.presentCall?.({ autonomy: true })
    expect(view).toMatchObject({ card: 'generic', kind: 'other', title: 'Enable autonomous goal advancement' })
    const off = tool.presentCall?.({ autonomy: false })
    expect(off).toMatchObject({ title: 'Disable autonomous goal advancement' })
  })

  it('surfaces malformed owned streams as MuseIntentError at replay', async () => {
    const { root } = await harness()
    root.session.append('muse/intent', {
      ...{ kind: 'muse/intent', version: 1, autonomy: true, updatedAt: 1 },
      autonomy: 'yes',
    } as never)
    expect(() => latestAutonomy(root.session.snapshotEvents())).toThrow(MuseIntentError)
  })
})
