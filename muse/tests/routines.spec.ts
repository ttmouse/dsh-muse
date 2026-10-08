import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MuseRoutines, nextOccurrence } from '../src/routines.ts'
import { museIntentChange } from '../src/domain.ts'
import { queueNotice } from '../src/mailbox.ts'

let root: string, ctx: Context
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'muse-routines-'))
  ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(GoalService)
})
afterEach(async () => { await ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }) })

async function fixture() {
  const session = ctx.sessions.create(SessionId(`routine-${Math.random()}`))
  let status: 'idle' | 'running' = 'running'
  const queued: UserMessage[] = []
  const agent = {
    id: session.id, options: {}, session, ctx,
    get status() { return status },
    inbox: { nextTurn: queued, nextStep: [] },
    followup: (message: UserMessage) => { queued.push(message) },
    runMaintenance: (operation: (signal: AbortSignal) => Promise<unknown>) => operation(new AbortController().signal),
  } as unknown as Agent
  await ctx.agents.register(agent)
  session.append('turn/start', { turn: 1 })
  const human = createUserMessage({ content: [{ type: 'text', text: 'Keep working every ten minutes, at most two times' }], source: { kind: 'user' } })
  session.append('user/message', human, { surfaceOp: 'append' })
  session.append('muse/intent', museIntentChange(true, Date.now()))
  const service = new MuseRoutines(ctx, 3600, root)
  const create = (extra = {}) => ctx.agents.withInitiator(agent, () => service.create(agent, {
    title: 'project progress', prompt: 'Advance one requested task and keep a result log', everySeconds: 600, maxRuns: 2, ...extra,
  }, human.id))
  return { agent, session, queued, human, service, create, idle() { status = 'idle' }, busy() { status = 'running' }, consume() {
    for (const message of queued.splice(0)) session.append('user/message', message, { surfaceOp: 'append' })
  } }
}

describe('Muse timer routines', () => {
  it('stays silent before due, coalesces missed intervals, and stops at the human run budget', async () => {
    const f = await fixture(), routine = f.create()
    f.idle()
    await f.service.tick(routine.nextRunAt - 1)
    expect(f.queued).toHaveLength(0)
    await f.service.tick(routine.nextRunAt + 3_600_000)
    expect(f.queued).toHaveLength(1)
    expect(f.queued[0]?.source).toMatchObject({ kind: 'muse', trigger: 'routine' })
    const after = f.service.list(f.agent)[0]!
    expect(after.runs).toBe(1)
    expect(after.nextRunAt).toBeGreaterThan(routine.nextRunAt + 3_600_000)
    f.consume()
    await f.service.tick(after.nextRunAt)
    expect(f.service.list(f.agent)[0]).toMatchObject({ runs: 2, enabled: false })
    f.consume()
    await f.service.tick(after.nextRunAt + 10_000_000)
    expect(f.queued).toHaveLength(0)
  })

  it('defers busy work without consuming its schedule and honors revocation', async () => {
    const f = await fixture(), r = f.create()
    await f.service.tick(r.nextRunAt)
    expect(f.service.list(f.agent)[0]?.runs).toBe(0)
    f.idle()
    f.session.append('muse/intent', museIntentChange(false, Date.now()))
    await f.service.tick(r.nextRunAt)
    expect(f.queued).toHaveLength(0)
    expect(f.service.list(f.agent)[0]?.nextRunAt).toBe(r.nextRunAt)
  })

  it('keeps a failed admission retryable and deduplicates after a crash before ledger commit', async () => {
    const f = await fixture(), r = f.create()
    f.idle()
    vi.spyOn(ctx.sessions, 'flush').mockRejectedValueOnce(new Error('temporary disk failure'))
    await f.service.tick(r.nextRunAt)
    expect(f.service.list(f.agent)[0]?.runs).toBe(0)
    expect(f.queued).toHaveLength(1)
    f.consume()
    await f.service.tick(r.nextRunAt)
    expect(f.queued).toHaveLength(0)
    expect(f.service.list(f.agent)[0]?.runs).toBe(1)
  })

  it('cannot manage routines from a script, automatic turn, or absent standing grant', async () => {
    const f = await fixture()
    expect(() => f.service.create(f.agent, { title: 'bad', prompt: 'bad', everySeconds: 600, maxRuns: 2 }, f.human.id)).toThrow('human driver')
    f.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    f.session.append('turn/start', { turn: 2 })
    f.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'grant it' }], source: { kind: 'muse', trigger: 'routine', deliveryId: 'automatic' } }), { surfaceOp: 'append' })
    expect(f.create).toThrow('current turn')
  })

  it('cannot bypass the enabled task cap by pausing, creating, then resuming', async () => {
    const f = await fixture()
    const first = f.create()
    for (let i = 0; i < 7; i++) f.create()
    ctx.agents.withInitiator(f.agent, () => f.service.setEnabled(f.agent, first.id, false, f.human.id))
    f.create()
    expect(() => ctx.agents.withInitiator(f.agent, () => f.service.setEnabled(f.agent, first.id, true, f.human.id))).toThrow('eight enabled')
  })

  it('goal reviews never bypass paused, blocked, disarmed or exhausted goal state', async () => {
    const f = await fixture()
    const goal = ctx.goals.create(f.agent, { objective: 'human goal' })
    const r = f.create({ bindGoal: true })
    ctx.goals.pause(f.agent, { id: goal.id, revision: goal.revision })
    f.idle()
    await f.service.tick(r.nextRunAt)
    expect(f.queued).toHaveLength(0)
  })

  it('delivers a deduplicated proposal with a non-human source and explicit no-execution framing', async () => {
    const f = await fixture()
    f.idle()
    const first = queueNotice(f.session.id, 'You could ask me to compare the two plans', 'idea', root)
    expect(queueNotice(f.session.id, 'You could ask me to compare the two plans', 'idea', root).queued).toBe(false)
    await f.service.tick()
    expect(f.queued).toHaveLength(1)
    expect(f.queued[0]?.source).toMatchObject({ kind: 'muse', trigger: 'idea' })
    expect(f.queued[0]?.content[0]).toMatchObject({ text: expect.stringContaining('never an execution request') })
    const path = join(root, 'notices', readdirSync(join(root, 'notices'))[0]!)
    expect(JSON.parse(readFileSync(path, 'utf8')).deliveredAt).toBeTypeOf('number')
    f.consume()
    await f.service.tick()
    expect(f.queued).toHaveLength(0)
    expect(first.queued).toBe(true)
  })

  it('retains queued proposals while autonomy is revoked', async () => {
    const f = await fixture()
    f.idle()
    f.session.append('muse/intent', museIntentChange(false, Date.now()))
    queueNotice(f.session.id, 'a proposal', 'idea', root)
    await f.service.tick()
    expect(f.queued).toHaveLength(0)
  })

  it('quarantines an out-of-schema notice once and still delivers valid ones in the same tick', async () => {
    const f = await fixture()
    f.idle()
    const poison = join(root, 'notices', 'poison.json')
    mkdirSync(join(root, 'notices'), { recursive: true })
    writeFileSync(poison, JSON.stringify({ version: 1, id: 'poison', sessionId: f.session.id, kind: 'handoff', text: 'written outside the schema', createdAt: Date.now() }))
    queueNotice(f.session.id, 'a valid notice', 'notice', root)
    await f.service.tick()
    expect(f.queued).toHaveLength(1)
    expect(readdirSync(join(root, 'notices'))).toContain('poison.json.invalid')
    expect(readdirSync(join(root, 'notices'))).not.toContain('poison.json')
    expect(readFileSync(join(root, 'activity.log'), 'utf8')).toContain('notice-quarantined poison.json')
    // The quarantined name leaves the .json listing, so later ticks stay silent about it.
    await f.service.tick()
    expect(f.queued).toHaveLength(1)
    expect(readFileSync(join(root, 'activity.log'), 'utf8').match(/notice-quarantined/g)).toHaveLength(1)
  })

  it('expires a stale timer notice instead of delivering it late (2026-10-08 排队 37-80h 实测回归)', async () => {
    const f = await fixture()
    f.idle()
    mkdirSync(join(root, 'notices'), { recursive: true })
    writeFileSync(join(root, 'notices', 'stale.json'), JSON.stringify({
      version: 1, id: 'stale', sessionId: f.session.id, kind: 'notice',
      text: '37 小时前的日程提醒', createdAt: Date.now() - 37 * 3600 * 1000,
    }))
    const fresh = queueNotice(f.session.id, '刚刚发生的提醒', 'notice', root)
    await f.service.tick()
    // 过期的那条不投递、改为 .expired 留证；新鲜的照常投递
    expect(f.queued).toHaveLength(1)
    expect(f.queued[0]?.content[0]).toMatchObject({ text: expect.stringContaining('刚刚发生的提醒') })
    expect(readdirSync(join(root, 'notices'))).toContain('stale.json.expired')
    expect(readFileSync(join(root, 'activity.log'), 'utf8')).toContain('notice-expired stale.json')
    expect(fresh.queued).toBe(true)
  })

  it('never expires an idea: proposals have no deadline', async () => {
    const f = await fixture()
    f.idle()
    mkdirSync(join(root, 'notices'), { recursive: true })
    writeFileSync(join(root, 'notices', 'old-idea.json'), JSON.stringify({
      version: 1, id: 'old-idea', sessionId: f.session.id, kind: 'idea',
      text: '三天前的一个提议', createdAt: Date.now() - 72 * 3600 * 1000,
    }))
    await f.service.tick()
    expect(f.queued).toHaveLength(1)
    expect(f.queued[0]?.source).toMatchObject({ kind: 'muse', trigger: 'idea' })
  })

  it('rejects notice kinds outside the schema at the writer boundary', () => {
    expect(() => queueNotice('session-x', 'text', 'handoff' as unknown as 'notice', root)).toThrow('Invalid Muse notice kind')
  })

  it('records a waiting condition with backoff and a completed task ends future runs', async () => {
    const f = await fixture(), r = f.create({ maxRuns: 4 })
    f.idle()
    await f.service.tick(r.nextRunAt)
    f.consume(); f.busy()
    const delivery = f.service.list(f.agent)[0]!.lastMessageId!
    ctx.agents.withInitiator(f.agent, () => f.service.recordResult(f.agent, delivery, 'waiting', 'Waiting for the requested input file', 'Check its arrival', 3600))
    const waiting = f.service.list(f.agent)[0]!
    expect(waiting.lastResult?.status).toBe('waiting')
    expect(waiting.nextRunAt).toBeGreaterThan(Date.now() + 3_500_000)
    f.idle()
    await f.service.tick(waiting.nextRunAt)
    f.consume(); f.busy()
    const latest = f.service.list(f.agent)[0]!
    ctx.agents.withInitiator(f.agent, () => f.service.recordResult(f.agent, latest.lastMessageId!, 'done', 'Verified the output file', ''))
    f.idle()
    await f.service.tick(latest.nextRunAt + 1_000_000)
    expect(f.queued).toHaveLength(0)
    expect(f.service.list(f.agent)[0]?.lastResult?.status).toBe('done')
    expect(f.service.list(f.agent)[0]?.enabled).toBe(false)
    f.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    f.session.append('turn/start', { turn: 2 })
    const human = createUserMessage({ content: [{ type: 'text', text: 'Resume this task within its remaining budget' }], source: { kind: 'user' } })
    f.session.append('user/message', human, { surfaceOp: 'append' })
    f.busy()
    const resumed = ctx.agents.withInitiator(f.agent, () => f.service.setEnabled(f.agent, r.id, true, human.id))
    expect(resumed.lastResult?.summary).toBe('Verified the output file')
    f.idle()
    await f.service.tick(resumed.nextRunAt)
    expect(f.queued).toHaveLength(1)
    expect(f.service.list(f.agent)[0]?.runs).toBe(3)
  })

  it('calculates the first future anchored occurrence rather than replaying missed ticks', () => {
    expect(nextOccurrence(1000, 500, 1000)).toBe(1500)
    expect(nextOccurrence(1000, 500, 2699)).toBe(3000)
  })
})
