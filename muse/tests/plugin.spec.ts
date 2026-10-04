import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as muse from '../src/index.ts'
import { museIntentChange } from '../src/domain.ts'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(GoalService)
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('Muse plugin composition', () => {
  it('has the Loader-safe function-plugin export shape', () => {
    expect('default' in muse).toBe(false)
    expect(muse.name).toBe('muse')
    expect(muse.inject).toEqual(['agents', 'goals', 'sessions'])
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(muse)).toBe(muse)
  })

  it('re-arms a disarmed active goal once, from a durable autonomy intent', async () => {
    const ctx = await harness()
    await ctx.plugin(muse)
    const root = await ctx.agents.create({ sessionId: SessionId('muse-root') })

    root.agent.session.append('muse/intent', museIntentChange(true, 1))
    ctx.goals.create(root.agent, { objective: 'keep the site healthy' })
    expect(ctx.goals.get(root.agent)?.activation).toBe('armed')

    /* Simulate a restart epoch: durable phase stays, activation is gone. */
    ctx.goals.disarm(root.agent)
    expect(ctx.goals.get(root.agent)?.activation).toBe('disarmed')

    agentEvents(ctx, root.agent).emit('agent/status', { status: 'running' })
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(ctx.goals.get(root.agent)?.activation).toBe('armed')

    /* One decision per epoch: a later manual disarm is not reverted again. */
    ctx.goals.disarm(root.agent)
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(ctx.goals.get(root.agent)?.activation).toBe('disarmed')
  })

  it('leaves goals alone without autonomy and never touches non-active phases', async () => {
    const ctx = await harness()
    await ctx.plugin(muse)
    const root = await ctx.agents.create({ sessionId: SessionId('muse-quiet') })

    ctx.goals.create(root.agent, { objective: 'unmanaged work' })
    ctx.goals.disarm(root.agent)
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(ctx.goals.get(root.agent)?.activation).toBe('disarmed')

    /* A latest-wins off intent also suppresses re-arming. */
    root.agent.session.append('muse/intent', museIntentChange(true, 1))
    root.agent.session.append('muse/intent', museIntentChange(false, 2))
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(ctx.goals.get(root.agent)?.activation).toBe('disarmed')

    /* A paused goal is not resumed even under explicit autonomy. */
    const other = await ctx.agents.create({ sessionId: SessionId('muse-paused') })
    other.agent.session.append('muse/intent', museIntentChange(true, 1))
    const created = ctx.goals.create(other.agent, { objective: 'paused work' })
    ctx.goals.pause(other.agent, { id: created.id, revision: created.revision })
    agentEvents(ctx, other.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(ctx.goals.get(other.agent)?.phase).toBe('paused')
  })

  it('never lets deployment defaultAutonomy grant authority without a human intent', async () => {
    const ctx = await harness()
    await ctx.plugin(muse, { defaultAutonomy: true })
    const root = await ctx.agents.create({ sessionId: SessionId('muse-default') })
    ctx.goals.create(root.agent, { objective: 'implicit autonomy work' })
    ctx.goals.disarm(root.agent)
    agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })
    await settle()
    expect(ctx.goals.get(root.agent)?.activation).toBe('disarmed')
  })

  it('leaves a disarmed active goal alone when its round budget is exhausted', async () => {
    const ctx = await harness()
    const root = await ctx.agents.create({ sessionId: SessionId('muse-exhausted') })
    const goal = ctx.goals.create(root.agent, { objective: 'bounded work', maxGoalRounds: 1 })
    const session = root.agent.session
    session.append('muse/intent', museIntentChange(true, 1))
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'round one' }],
      source: { kind: 'goal', goalId: goal.id, revision: goal.revision, round: 1 },
    }), { surfaceOp: 'append' })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    ctx.goals.disarm(root.agent)
    await ctx.plugin(muse)
    expect(() => agentEvents(ctx, root.agent).emit('agent/status', { status: 'idle' })).not.toThrow()
    expect(ctx.goals.get(root.agent)).toMatchObject({ activation: 'disarmed', roundsStarted: 1 })
    await ctx.fiber.dispose()
  })
})
