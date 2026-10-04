import { describe, expect, it } from 'vitest'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Context } from '@deepseek-ai/cordis'
import { museSessionEvents } from '../src/session-events.ts'
import { latestAutonomy, museIntentChange } from '../src/domain.ts'

describe('Muse session log access', () => {
  it('reads autonomy from the source Session getter', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('muse-source-log'))
    session.append('muse/intent', museIntentChange(true, 1))
    expect(latestAutonomy(museSessionEvents(session))).toBe(true)
    await ctx.fiber.dispose()
  })

  it('uses the installed host snapshot method with its owning receiver', () => {
    const events: readonly SessionEvent[] = []
    const session = {
      log: events,
      get events(): never { throw new Error('obsolete getter must not be read') },
      snapshotEvents() { return this.log },
    }
    expect(museSessionEvents(session)).toBe(events)
  })
})
