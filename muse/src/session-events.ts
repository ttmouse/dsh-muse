/**
 * Session log access for source-linked Muse plugins on installed Harness hosts.
 * @module @deepseek-ai/dsh-muse
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'

type SessionLog =
  | { readonly events: readonly SessionEvent[] }
  | { snapshotEvents(): readonly SessionEvent[] }

/**
 * Read the complete immutable log through the host's Session API.
 * Supports the source checkout's events getter and installed hosts' snapshotEvents method.
 * @param session - owning session; snapshotEvents takes precedence when available.
 * @returns The host's complete event snapshot, preserving its receiver.
 */
export function museSessionEvents(session: SessionLog): readonly SessionEvent[] {
  return 'snapshotEvents' in session ? session.snapshotEvents() : session.events
}
