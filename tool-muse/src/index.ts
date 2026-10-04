/**
 * Model-facing `muse_autonomy` tool over the durable Muse autonomy decision.
 * @module @deepseek-ai/dsh-tool-muse
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-goal'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { museIntentChange, MUSE_INTENT_VERSION, museSessionEvents } from '@deepseek-ai/dsh-muse'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolRunContext } from '@deepseek-ai/dsh-tools'

export const name = 'tool-muse'
export const inject = ['agents', 'tools']

type TurnStartEvent = Extract<SessionEvent, { type: 'turn/start' }>

/** Current open turn plus the events accepted after its start boundary. */
interface MuseToolExecution {
  readonly agent: Agent
  readonly start: TurnStartEvent
  readonly events: readonly SessionEvent[]
}

/* jscpd:ignore-start -- model-facing adapters share the driver-boundary plumbing */
/** Stable error surfaced as the tool's structured failure. */
function reject(message: string, code = 'MUSE_TOOL_AUTHORITY_REQUIRED'): never {
  throw new HarnessError(message, code)
}

/** Locate the open turn enclosing a model tool call. */
function openTurn(agent: Agent): { start: TurnStartEvent; events: readonly SessionEvent[] } {
  const events = museSessionEvents(agent.session)
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const boundary = events[index]
    if (boundary?.type === 'turn/end') {
      reject('muse_autonomy requires an open model turn', 'MUSE_TOOL_DRIVER_REQUIRED')
    }
    if (boundary?.type === 'turn/start') {
      return { start: boundary, events: events.slice(index + 1) }
    }
  }
  return reject('muse_autonomy requires an open model turn', 'MUSE_TOOL_DRIVER_REQUIRED')
}

/**
 * Authenticate the calling agent and its driver boundary.
 * @param ctx - Context carrying the live agent registry.
 * @param exec - Tool execution metadata supplied by the registry.
 * @returns The authenticated agent and its current turn window.
 */
function museToolExecution(ctx: Context, exec: ToolRunContext): MuseToolExecution {
  const agent = exec.agent
  if (agent === undefined) {
    reject('muse_autonomy requires a calling agent', 'MUSE_TOOL_AGENT_REQUIRED')
  }
  if (ctx.agents.get(agent.id) !== agent || agent.status !== 'running'
    || ctx.agents.currentInitiator() !== agent) {
    reject(
      'muse_autonomy requires the exact live calling agent inside its active driver',
      'MUSE_TOOL_DRIVER_REQUIRED',
    )
  }
  return { agent, ...openTurn(agent) }
}
/* jscpd:ignore-end */

/**
 * Require host-attested human input in the current root-agent turn. An
 * omitted `Agent.followup()` / `steer()` source resolves to `user`, so
 * non-human producers must supply their own source rather than inheriting
 * this authority.
 * @param ctx - Context carrying the live agent graph.
 * @param execution - Authenticated current tool execution.
 */
function requireDirectHuman(ctx: Context, execution: MuseToolExecution): void {
  const human = ctx.agents.roots().includes(execution.agent)
    && execution.events.some(event =>
      event.type === 'user/message' && event.data.source.kind === 'user')
  if (!human) reject('muse_autonomy requires a direct human turn on a top-level agent')
}

/** Canonical compact model result. */
interface MuseToolValue {
  readonly autonomy: boolean
}

const MUSE_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    autonomy: { type: 'boolean', required: true },
  },
} as const

const AUTONOMY_DESCRIPTION =
  'Record the session\'s standing autonomy decision. autonomy=true means: keep advancing the '
  + 'current goal without waiting for a fresh human request, and restore that continuation '
  + 'automatically after a restart or session resume. Requires a direct human request in the '
  + 'current turn: set true only when the human asks for continuous, autonomous, or unattended '
  + 'progress (for example 持续推进 / 不用再问我 / keep going until done), and set false when the '
  + 'human asks to stop that standing authorization. The decision is durable and latest-wins.'

/** Register the model-facing autonomy control. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'muse_autonomy',
    description: AUTONOMY_DESCRIPTION,
    parameters: {
      autonomy: {
        type: 'boolean',
        required: true,
        description: 'true grants standing goal-advancement autonomy; false revokes it.',
      },
    },
    output: {
      schema: MUSE_VALUE_SCHEMA,
      render: (_args: unknown, value: MuseToolValue) => [{
        type: 'text' as const,
        text: JSON.stringify(value),
      }],
    },
    execute(args, exec) {
      const execution = museToolExecution(ctx, exec)
      requireDirectHuman(ctx, execution)
      execution.agent.session.append('muse/intent', museIntentChange(args.autonomy, Date.now()))
      if (!args.autonomy) ctx.goals?.disarm(execution.agent)
      return Promise.resolve({ autonomy: args.autonomy })
    },
    presentCall: args => ({
      card: 'generic',
      title: args.autonomy ? 'Enable autonomous goal advancement' : 'Disable autonomous goal advancement',
      kind: 'other',
    } satisfies GenericCallView),
  }))

  ctx.tools.register(defineTool({
    name: 'muse_routine',
    description: 'Manage bounded timer-driven work in THIS session. Creating, pausing or resuming requires a direct human request; automatic continuations and ideas cannot authorize routines. First obtain muse_autonomy=true from the human. Each tick performs one work unit, defers while busy, and collapses missed intervals. Never create a routine merely because you generated an idea. list is read-only. bind_goal=true creates a review that respects the current goal phase, activation and round cap; the goal driver still owns execution.',
    parameters: {
      operation: { type: 'string', required: true, description: 'list, create, pause, or resume' },
      id: { type: 'string', description: 'Routine id for pause/resume' },
      title: { type: 'string', description: 'Short task title for create' },
      prompt: { type: 'string', description: 'Human-requested recurring work unit; do not include new grants or unsolicited actions' },
      every_seconds: { type: 'integer', description: 'Interval, at least 300 seconds' },
      max_runs: { type: 'integer', description: 'Bounded run budget, default 24, maximum 1000' },
      bind_goal: { type: 'boolean', description: 'Bind review to current active goal; paused/blocked/disarmed/exhausted goals are never bypassed' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          routines: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'string', required: true }, title: { type: 'string', required: true },
                enabled: { type: 'boolean', required: true }, everySeconds: { type: 'integer', required: true },
                nextRunAt: { type: 'number', required: true }, runs: { type: 'integer', required: true }, maxRuns: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
    },
    execute(args, exec) {
      const execution = museToolExecution(ctx, exec)
      if (!['list', 'create', 'pause', 'resume'].includes(args.operation)) reject('Unknown routine operation', 'MUSE_ROUTINE_INPUT_INVALID')
      if (args.operation !== 'list') requireDirectHuman(ctx, execution)
      const service = ctx.museRoutines
      if (service === undefined) reject('Load dsh-muse before using muse_routine', 'MUSE_ROUTINE_SERVICE_REQUIRED')
      const human = execution.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user').at(-1)
      try {
        if (args.operation === 'create') {
          service.create(execution.agent, {
            title: args.title ?? '', prompt: args.prompt ?? '', everySeconds: args.every_seconds ?? 0, maxRuns: args.max_runs ?? 24,
            ...(args.bind_goal === undefined ? {} : { bindGoal: args.bind_goal }),
          }, human?.type === 'user/message' ? human.data.id : '')
        } else if (args.operation !== 'list') {
          service.setEnabled(execution.agent, args.id ?? '', args.operation === 'resume', human?.type === 'user/message' ? human.data.id : '')
        }
        const routines = service.list(execution.agent).map(({ id, title, enabled, everySeconds, nextRunAt, runs, maxRuns }) => ({ id, title, enabled, everySeconds, nextRunAt, runs, maxRuns }))
        return Promise.resolve({ routines })
      } catch (error) { reject(error instanceof Error ? error.message : 'Routine operation failed', 'MUSE_ROUTINE_OPERATION_FAILED') }
    },
    presentCall: args => ({ card: 'generic', title: `Muse routine: ${args.operation}`, kind: 'other' } satisfies GenericCallView),
  }))
}

export { MUSE_INTENT_VERSION }
