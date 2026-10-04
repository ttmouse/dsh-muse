/** Human authorization sidecar tied to a host-attested durable input record. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { atomicJson, museHome } from './mailbox.ts'
import { latestAutonomy } from './domain.ts'
import { museSessionEvents } from './session-events.ts'

function path(sessionId: string): string {
  return join(museHome(), 'intents', `${createHash('sha256').update(sessionId).digest('hex')}.json`)
}

interface Intent {
  version: 1
  sessionId: string
  autonomy: boolean
  humanMessageId: string
  humanSeq: number
  recordedAfterSeq: number
  updatedAt: number
}

/** Caller authenticates the active direct-human driver before writing. */
export function recordAutonomy(ctx: Context, agent: Agent, autonomy: boolean, humanMessageId: string): void {
  if (ctx.agents.get(agent.id) !== agent || ctx.agents.currentInitiator() !== agent
    || agent.status !== 'running' || !ctx.agents.roots().includes(agent)) throw new Error('Autonomy requires a direct human driver')
  const events = museSessionEvents(agent.session)
  let current: typeof events = []
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.type === 'turn/end') break
    if (events[i]?.type === 'turn/start') { current = events.slice(i + 1); break }
  }
  const human = current.find(e => e.type === 'user/message' && e.data.id === humanMessageId && e.data.source.kind === 'user')
  if (!human) throw new Error('Standing autonomy requires a host-attested human input')
  const value: Intent = { version: 1, sessionId: agent.session.id, autonomy, humanMessageId, humanSeq: human.seq,
    recordedAfterSeq: events.at(-1)?.seq ?? human.seq, updatedAt: Date.now() }
  atomicJson(path(value.sessionId), value)
}

/** Missing, stale or foreign proof can never confer authority. Legacy logs still fold. */
export function agentAutonomy(agent: Agent): boolean | undefined {
  const events = museSessionEvents(agent.session)
  const legacy = [...events].reverse().find(e => e.type === 'muse/intent')
  const file = path(agent.session.id)
  if (!existsSync(file)) return latestAutonomy(events)
  const value = JSON.parse(readFileSync(file, 'utf8')) as Intent
  if (value.version !== 1 || value.sessionId !== agent.session.id || typeof value.autonomy !== 'boolean'
    || !Number.isSafeInteger(value.humanSeq) || !Number.isSafeInteger(value.recordedAfterSeq)) throw new Error('Invalid stored Muse authorization')
  if (!events.some(e => e.seq === value.humanSeq && e.type === 'user/message' && e.data.id === value.humanMessageId && e.data.source.kind === 'user')) return false
  if (legacy && legacy.seq > value.recordedAfterSeq) return latestAutonomy(events)
  return value.autonomy
}
