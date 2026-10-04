/**
 * Muse autonomy keeper: durable autonomy intent plus first-idle goal re-arming.
 * @module @deepseek-ai/dsh-muse
 */

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
/* Empty type imports carry the Context merges for agent events and ctx.goals. */
import type {} from '@deepseek-ai/dsh-goal'
import { latestAutonomy } from './domain.ts'
import { museSessionEvents } from './session-events.ts'
import { MuseRoutines } from './routines.ts'

export { latestAutonomy, MUSE_INTENT_VERSION, museIntentChange, MuseIntentError } from './domain.ts'
export { museSessionEvents } from './session-events.ts'
export { MuseRoutines, nextOccurrence } from './routines.ts'
export type { Routine, RoutineRequest } from './routines.ts'
export type { MuseIntentChange } from './types.ts'

export const name = 'muse'
export const inject = ['agents', 'goals', 'sessions']

/** Plugin configuration. */
export interface Config {
  /**
   * Autonomy applied to sessions whose log records no explicit
   * `muse/intent` decision. Default `false`: mounting the plugin alone
   * never grants standing autonomy.
   */
  defaultAutonomy: boolean
  routinePollSeconds?: number
}

export const Config: z<Config> = z.object({
  defaultAutonomy: z.boolean().default(false),
  routinePollSeconds: z.number().min(1).max(3600).default(60),
})

/**
 * Mount the autonomy keeper.
 * @param ctx - Cordis context of the calling scope.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  new MuseRoutines(ctx, config.routinePollSeconds ?? 60)
  /* One autonomy decision per live-agent epoch: an epoch re-runs only after
   * this plugin reloads, mirroring goal-round-driver's no-inherited-authority
   * rule at the keeper layer. */
  const handled = new WeakSet<object>()

  const rearm = (agent: Agent): void => {
    if (handled.has(agent)) return
    // Deployment configuration never substitutes for a direct human grant.
    const autonomy = latestAutonomy(museSessionEvents(agent.session)) ?? false
    if (!autonomy) return
    handled.add(agent)

    const view = ctx.goals.get(agent)
    if (view === undefined || view.phase !== 'active' || view.activation === 'armed') return
    if (view.roundsStarted >= view.maxGoalRounds) return
    ctx.goals.resume(agent, { id: view.id, revision: view.revision })
  }

  /* Session start covers resume epochs whose queue stays empty: a resumed
   * agent may never emit an idle transition, so the keeper defers past the
   * goal service's synchronous session-start disarm and re-arms then. */
  ctx.on('agent/created', ({ agent }) => {
    setImmediate(() => rearm(agent))
    return undefined
  })

  /* First idle covers epochs where autonomy arrives mid-session through the
   * muse_autonomy tool while the current goal sits disarmed. */
  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle') rearm(agent)
  })
}
