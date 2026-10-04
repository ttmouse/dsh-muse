/** Restart evidence through the real AgentLoop lifecycle: autonomy outlives the process. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import * as goalRoundDriver from '@deepseek-ai/dsh-goal-round-driver'
import * as toolGoal from '@deepseek-ai/dsh-tool-goal'
import { ToolCallId, createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { latestAutonomy } from '../src/domain.ts'
import * as muse from '../src/index.ts'
import * as toolMuse from '../../tool-muse/src/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionFormatUnsupportedError } from '@deepseek-ai/dsh-session-persistence'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: StreamChunk[][]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ScriptedAdapter: script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

function toolCall(name: string, id: string, args: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: ToolCallId(id), name, argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(id), name, arguments: args } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function text(value: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: value },
    { type: 'block-end', index: 0, block: { type: 'text', text: value } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

async function mount(root: string, adapter: LlmAdapter): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(GoalService)
  await ctx.plugin(toolGoal)
  await ctx.plugin(goalRoundDriver)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  await ctx.plugin(muse)
  await ctx.plugin(toolMuse)
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

async function waitForRounds(ctx: Context, sessionId: SessionId, rounds: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const session = ctx.sessions.get(sessionId)
    const started = session?.snapshotEvents().filter(event => event.type === 'user/message')
      .filter(event => event.data.source.kind === 'goal')
      .reduce((max, event) => Math.max(max, (event.data.source as { round: number }).round), 0) ?? 0
    if (started >= rounds) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`goal rounds did not reach ${rounds} in time`)
}

describe('Muse autonomy across a real process restart', () => {
  it('keeps advancing an armed goal after the whole context dies and resumes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-muse-restart-'))
    roots.push(root)
    const sessionId = SessionId('muse-restart-proof')

    /* Epoch one: the human asks for continuous advancement; the model creates
     * the goal, records autonomy, and the driver admits round one. */
    const firstAdapter = new ScriptedAdapter([
      toolCall('create_goal', 'call_create', '{"objective":"Keep the proof alive","max_goal_rounds":2}'),
      toolCall('muse_autonomy', 'call_muse', '{"autonomy":true}'),
      text('ARMED'),
      text('ROUND ONE PROGRESS'),
    ])
    const first = await mount(root, firstAdapter)
    const created = await first.agents.create({
      sessionId,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    created.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Keep advancing this goal for me, even across restarts.' }],
      source: { kind: 'user' },
    }))
    await waitForRounds(first, sessionId, 1)
    await created.agent.whenIdle()
    expect(latestAutonomy(created.agent.session.snapshotEvents())).toBe(true)
    const goal = first.goals.get(created.agent)
    expect(goal?.phase).toBe('active')
    await first.fiber.dispose()

    /* Epoch two: a fresh process resumes the same session. The keeper re-arms
     * the disarmed active goal from the durable intent, and round two runs.
     * A host whose baked event vocabulary lacks `muse/intent` refuses the
     * persisted log at resume instead — its persistence gate is build-time
     * generated, and `Session.append` cannot mark a plugin event ignorable.
     * That refusal is the documented standalone boundary, not a keeper bug. */
    const secondAdapter = new ScriptedAdapter([
      text('ROUND TWO PROGRESS'),
    ])
    const second = await mount(root, secondAdapter)
    let resumed: Awaited<ReturnType<typeof second.agents.resume>>
    try {
      resumed = await second.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: { provider: 'mock', model: 'mock' },
      })
    } catch (error: unknown) {
      if (!(error instanceof SessionFormatUnsupportedError)) throw error
      expect(String(error)).toContain('muse/intent')
      return
    }
    await waitForRounds(second, sessionId, 2)
    await resumed.agent.whenIdle()
    const resumedGoal = second.goals.get(resumed.agent)
    expect(resumedGoal?.roundsStarted).toBe(2)
    expect(latestAutonomy(resumed.agent.session.snapshotEvents())).toBe(true)
  })

  it('leaves a resumed goal disarmed when autonomy was never granted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-muse-noop-'))
    roots.push(root)
    const sessionId = SessionId('muse-restart-unmanaged')

    const firstAdapter = new ScriptedAdapter([
      toolCall('create_goal', 'call_create', '{"objective":"Unmanaged work","max_goal_rounds":3}'),
      text('CREATED'),
    ])
    const first = await mount(root, firstAdapter)
    const created = await first.agents.create({
      sessionId,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    created.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Track this goal, but wait for me each time.' }],
      source: { kind: 'user' },
    }))
    await created.agent.whenIdle()
    await first.fiber.dispose()

    const second = await mount(root, new ScriptedAdapter([]))
    const resumed = await second.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    const goal = second.goals.get(resumed.agent)
    expect(goal?.phase).toBe('active')
    expect(goal?.activation).toBe('disarmed')
    expect(goal?.roundsStarted).toBe(0)
  })
})
