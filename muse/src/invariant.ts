/**
 * Package-owned strict Muse intent-stream invariant.
 * @module @deepseek-ai/dsh-muse/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { latestAutonomy, MuseIntentError } from './domain.ts'
import { museSessionEvents } from './session-events.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-muse'

/** Cordis invariant-companion plugin name. */
export const name = 'muse-invariant'
/** Service required before reserving this package's invariant ownership. */
export const inject = ['invariants']

/** Validate a complete exact-session stream: every intent record must parse. */
function validate(events: readonly SessionEvent[], fail: InvariantFailure): void {
  try {
    latestAutonomy(events)
  } catch (error: unknown) {
    if (!(error instanceof MuseIntentError)) throw error
    fail(error.message)
  }
}

/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/**
 * Install replay and pre-append validation for the owned event stream.
 * @param ctx - Cordis context carrying the invariant registry.
 * @param fail - failure reporter supplied by the invariant runtime.
 * @returns Exact registration disposer.
 */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) {
    validate(museSessionEvents(session), fail)
  }
  ctx.on('session/created', (session) => {
    validate(museSessionEvents(session), fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (event.type !== 'muse/intent') return
    validate([...museSessionEvents(session), event], fail)
  }, { global: true })
}, { inject: ['sessions'] })
/* jscpd:ignore-end */

/**
 * Register the package-owned invariant companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns Exact registration disposer after child setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
