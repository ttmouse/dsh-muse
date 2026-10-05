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
import { agentAutonomy } from '../src/intent-store.ts'
import * as muse from '../src/index.ts'
import * as toolMuse from '../../tool-muse/src/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'

const roots: string[] = []
const contexts: Context[] = []
const priorHome = process.env.DSH_HOME

afterEach(async () => {
  if (priorHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = priorHome
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
  process.env.DSH_HOME = join(root, 'dsh-home')
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
  it('renders an empty status plainly through the real AgentLoop tool result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-muse-status-empty-'))
    roots.push(root)
    const sessionId = SessionId('muse-status-empty-proof')
    const ctx = await mount(root, new ScriptedAdapter([
      toolCall('muse_status', 'call_empty_status_read', '{}'),
      text('EMPTY STATUS VERIFIED'),
    ]))
    const created = await ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    created.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Show this session\'s current goal and routine status.' }],
      source: { kind: 'user' },
    }))
    await created.agent.whenIdle()

    const result = created.agent.session.snapshotEvents().find(event =>
      event.type === 'tool/result' && event.data.message.toolCallId === 'call_empty_status_read')
    expect(result?.type).toBe('tool/result')
    if (result?.type !== 'tool/result') throw new Error('muse_status result was not recorded')
    expect(result.data.message.content).toEqual([{
      type: 'text', text: '当前会话状态\n目标：无\n定时任务：无',
    }])
  })

  it('serves current goal and routine state through the real AgentLoop tool chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-muse-status-runtime-'))
    roots.push(root)
    const sessionId = SessionId('muse-status-runtime-proof')
    const adapter = new ScriptedAdapter([
      toolCall('muse_autonomy', 'call_status_grant', '{"autonomy":true}'),
      toolCall('create_goal', 'call_status_goal', '{"objective":"Verify status integration","max_goal_rounds":4}'),
      toolCall('muse_routine', 'call_status_routine', '{"operation":"create","title":"Status fixture","prompt":"Private fixture prompt","every_seconds":600,"max_runs":3}'),
      toolCall('muse_status', 'call_status_read', '{}'),
      toolCall('muse_autonomy', 'call_status_revoke', '{"autonomy":false}'),
      text('STATUS INTEGRATION VERIFIED'),
    ])
    const ctx = await mount(root, adapter)
    const created = await ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    created.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Create temporary bounded goal and routine fixtures, then report their status.' }],
      source: { kind: 'user' },
    }))
    await created.agent.whenIdle()

    const statusResult = created.agent.session.snapshotEvents().find(event =>
      event.type === 'tool/result' && event.data.message.toolCallId === 'call_status_read')
    expect(statusResult?.type).toBe('tool/result')
    if (statusResult?.type !== 'tool/result') throw new Error('muse_status result was not recorded')
    const statusText = statusResult.data.message.content.find(part => part.type === 'text')?.text
    if (statusText === undefined) throw new Error('muse_status did not return its readable snapshot')
    expect(statusText).toContain('目标：Verify status integration')
    expect(statusText).toContain('阶段：active · 自治：armed')
    expect(statusText).toContain('进度：0/4 轮，剩余 4 轮')
    expect(statusText).toContain('定时任务：Status fixture')
    expect(statusText).toContain('状态：已排期')
    expect(statusText).toContain('次数：0/3，剩余 3 次')
    expect(statusText).toMatch(/下次运行：\d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC/)
    expect(statusText).not.toContain('Private fixture prompt')
    expect(agentAutonomy(created.agent)).toBe(false)
  })

  it('cold-wakes a due routine after process restart with human proof and a non-human source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-muse-timer-restart-'))
    roots.push(root)
    const sessionId = SessionId('muse-timer-restart-proof')
    const first = await mount(root, new ScriptedAdapter([
      toolCall('muse_autonomy', 'call_grant_timer', '{"autonomy":true}'),
      toolCall('muse_routine', 'call_timer', '{"operation":"create","title":"proof","prompt":"Do one bounded proof unit","every_seconds":300,"max_runs":1}'),
      text('TIMER REGISTERED'),
    ]))
    const created = await first.agents.create({ sessionId, agentOptions: { provider: 'mock', model: 'mock' } })
    created.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Autonomously run a proof unit every five minutes, once; keep this timer after restart.' }], source: { kind: 'user' } }))
    await created.agent.whenIdle()
    const routine = first.museRoutines.list(created.agent)[0]
    expect(routine).toBeDefined()
    expect(created.agent.session.snapshotEvents().some(e => e.type === 'muse/intent')).toBe(false)
    await first.fiber.dispose()
    const second = await mount(root, new ScriptedAdapter([text('TIMER PROOF UNIT COMPLETE')]))
    expect(second.agents.get(sessionId)).toBeUndefined()
    await second.museRoutines.tick(routine!.nextRunAt)
    const resumed = second.agents.get(sessionId)
    expect(resumed).toBeDefined()
    await resumed!.whenIdle()
    expect(resumed!.session.snapshotEvents().some(e => e.type === 'user/message' && e.data.source.kind === 'muse' && e.data.source.trigger === 'routine')).toBe(true)
    expect(second.museRoutines.list(resumed!)[0]).toMatchObject({ runs: 1, enabled: false })
  })

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
    expect(agentAutonomy(created.agent)).toBe(true)
    const goal = first.goals.get(created.agent)
    expect(goal?.phase).toBe('active')
    await first.fiber.dispose()

    /* Epoch two: a fresh process resumes the same session. The keeper re-arms
     * the disarmed active goal from the durable intent, and round two runs.
     * The grant references a durable human message in a separate file; no
     * unknown required event is introduced into the host's strict log. */
    const secondAdapter = new ScriptedAdapter([
      text('ROUND TWO PROGRESS'),
    ])
    const second = await mount(root, secondAdapter)
    const resumed = await second.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await waitForRounds(second, sessionId, 2)
    await resumed.agent.whenIdle()
    const resumedGoal = second.goals.get(resumed.agent)
    expect(resumedGoal?.roundsStarted).toBe(2)
    expect(agentAutonomy(resumed.agent)).toBe(true)
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
