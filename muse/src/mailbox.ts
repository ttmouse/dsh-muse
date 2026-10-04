/** Local durable mailbox. Timer scripts never impersonate a human RPC request. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'

export function museHome(): string { return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'muse') }

export function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  renameSync(temporary, path)
}

export interface MuseNotice {
  version: 1
  id: string
  sessionId: string
  kind: 'notice' | 'idea'
  text: string
  createdAt: number
  deliveredAt?: number
}

/** Same content for a session stays one proposal until it is explicitly changed. */
export function queueNotice(sessionId: string, text: string, kind: MuseNotice['kind'] = 'notice', root = museHome()): { id: string; queued: boolean } {
  if (!sessionId || !text.trim() || text.length > 12000) throw new Error('Invalid Muse notice')
  const id = createHash('sha256').update(JSON.stringify([sessionId, kind, text.trim()])).digest('hex')
  const path = join(root, 'notices', `${id}.json`)
  if (existsSync(path)) return { id, queued: false }
  const notice: MuseNotice = { version: 1, id, sessionId, kind, text: text.trim(), createdAt: Date.now() }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  // O_EXCL publishes once, even when two timer processes race.
  try { writeFileSync(path, JSON.stringify(notice) + '\n', { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; return { id, queued: false } }
  return { id, queued: true }
}

export function readNotice(path: string): MuseNotice {
  const value = JSON.parse(readFileSync(path, 'utf8')) as MuseNotice
  if (value.version !== 1 || !['notice', 'idea'].includes(value.kind) || typeof value.text !== 'string'
    || typeof value.sessionId !== 'string' || typeof value.id !== 'string' || !Number.isFinite(value.createdAt)) throw new Error('Invalid Muse mailbox record')
  return value
}
