/**
 * Durable Muse autonomy intent and its session-event vocabulary.
 * @module @deepseek-ai/dsh-muse
 */

/**
 * One durable autonomy decision for the owning session. The latest
 * `muse/intent` event in the log is authoritative; absence of any intent
 * event means the session never expressed autonomy, so deployment
 * configuration decides the default.
 */
export interface MuseIntentChange {
  /** Event discriminator. */
  readonly kind: 'muse/intent'
  /** Record format version; see `MUSE_INTENT_VERSION` in `./domain.ts`. */
  readonly version: 1
  /** Whether the agent may keep advancing its goal without a fresh human request. */
  readonly autonomy: boolean
  /** Unix epoch milliseconds of the decision. */
  readonly updatedAt: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Versioned Muse autonomy decision. The latest event in the log is the
     * only authority; earlier intents are history, not state.
     */
    'muse/intent': MuseIntentChange
  }
}
