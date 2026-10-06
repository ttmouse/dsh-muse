/** Persistent seen-set: inject-at-most-once per key within TTL, cap-bounded, crash-tolerant.
 *  Replaces capacity-1 single-hash dedup (message-triage) that let alternating batches re-inject.
 *  State file: JSON array of [key, timestampMs] pairs; corrupt file == empty set. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

function load(statePath) {
  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf8'))
    return Array.isArray(raw) ? raw.filter(e => Array.isArray(e) && typeof e[1] === 'number') : []
  } catch { return [] }
}

function prune(entries, ttlMs, now) {
  return entries.filter(([, at]) => now - at < ttlMs)
}

export function seenRecently(statePath, key, ttlMs, { now = Date.now() } = {}) {
  return prune(load(statePath), ttlMs, now).some(([k]) => k === key)
}

export function markSeen(statePath, key, ttlMs, { cap = 50, now = Date.now() } = {}) {
  const entries = prune(load(statePath), ttlMs, now).filter(([k]) => k !== key)
  entries.push([key, now])
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, JSON.stringify(entries.slice(-cap)))
}
