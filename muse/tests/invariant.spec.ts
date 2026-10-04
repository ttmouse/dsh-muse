import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { museIntentChange } from '../src/domain.ts'
import * as museInvariant from '../src/invariant.ts'

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry)
  const fiber = await ctx.plugin(museInvariant)
  return { ctx, fiber }
}

function intentData(autonomy: boolean, version: number) {
  return { ...museIntentChange(autonomy, 1), version }
}

describe('Muse package invariant', () => {
  it('accepts valid intent records and rejects unsupported versions before append', async () => {
    const { ctx, fiber } = await harness()
    const session = ctx.sessions.create(SessionId('muse-invariant'))
    session.append('muse/intent', museIntentChange(true, 1))
    session.append('muse/intent', museIntentChange(false, 2))
    expect(session.snapshotEvents()).toHaveLength(2)

    expect(() => session.append('muse/intent', {
      kind: 'muse/intent',
      version: 99 as never,
      autonomy: true,
      updatedAt: 3,
    })).toThrow(InvariantError)
    expect(session.snapshotEvents()).toHaveLength(2)
    await fiber.dispose()
  })

  it('rejects a malformed existing owned stream during companion setup', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(InvariantRegistry)
    ctx.sessions.create(SessionId('muse-invalid-seed'), {
      seed: [{ type: 'muse/intent', seq: 0, time: 1, data: intentData(true, 9) } as SessionEvent],
    })
    await expect(ctx.plugin(museInvariant).then(() => undefined)).rejects.toThrow(InvariantError)
    await ctx.fiber.dispose()
  })

  it('propagates unexpected validation failures unchanged', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(InvariantRegistry)
    ctx.sessions.create(SessionId('muse-corrupt-seed'), {
      seed: [{ type: 'muse/intent', seq: 0, time: 1, data: null } as unknown as SessionEvent],
    })
    await expect(ctx.plugin(museInvariant)).rejects.toThrow(TypeError)
    await ctx.fiber.dispose()
  })
})
