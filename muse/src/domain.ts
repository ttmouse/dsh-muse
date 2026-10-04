/**
 * Pure Muse autonomy decision logic over the session event log.
 * @module @deepseek-ai/dsh-muse
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Current `muse/intent` record version. */
export const MUSE_INTENT_VERSION = 1

/** Stable error for a malformed owned intent stream. */
export class MuseIntentError extends Error {}

/**
 * Validate one durable intent record read from the log. Log data is a
 * durable boundary, so the record is read defensively instead of trusting
 * the static payload type.
 * @param value - the `muse/intent` payload as stored.
 * @returns The record's autonomy decision.
 */
function decodeIntentAutonomy(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('muse/intent record must be an object')
  }
  const record = value as Record<string, unknown>
  if (record['version'] !== MUSE_INTENT_VERSION) {
    throw new MuseIntentError(`unsupported muse/intent version ${String(record['version'])}`)
  }
  const autonomy = record['autonomy']
  if (typeof autonomy !== 'boolean') {
    throw new MuseIntentError('muse/intent autonomy must be a boolean')
  }
  return autonomy
}

/**
 * Resolve the session's autonomy decision from the log: the latest
 * `muse/intent` event wins, and a log without any intent event yields
 * `undefined` so the caller applies its configured default.
 * @param events - complete session event stream, oldest first.
 * @returns The autonomy decision, or `undefined` when the log records none.
 */
export function latestAutonomy(events: readonly SessionEvent[]): boolean | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'muse/intent') return decodeIntentAutonomy(event.data)
  }
  return undefined
}

/**
 * Render the durable intent change for one autonomy decision.
 * @param autonomy - the decided autonomy value.
 * @param updatedAt - decision instant in Unix epoch milliseconds.
 * @returns The complete `muse/intent` payload ready to append.
 */
export function museIntentChange(autonomy: boolean, updatedAt: number): {
  kind: 'muse/intent'
  version: 1
  autonomy: boolean
  updatedAt: number
} {
  return { kind: 'muse/intent', version: MUSE_INTENT_VERSION, autonomy, updatedAt }
}
