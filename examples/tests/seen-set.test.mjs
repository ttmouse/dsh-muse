import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seenRecently, markSeen } from '../lib/seen-set.mjs'

function scratch(operation) {
  const root = mkdtempSync(join(tmpdir(), 'muse-seen-set-'))
  try { return operation(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

const TTL = 24 * 3600 * 1000

test('alternating batches stay deduped — capacity-1 single-hash regression', () => scratch(root => {
  const state = join(root, 'seen.json')
  // batch A injected
  assert.equal(seenRecently(state, 'A', TTL), false)
  markSeen(state, 'A', TTL)
  // batch B injected — must NOT evict A's record
  assert.equal(seenRecently(state, 'B', TTL), false)
  markSeen(state, 'B', TTL)
  // batch A again within TTL → skip (the historical double-injection: 2026-10-06 08:26-09:26, 4 reproductions)
  assert.equal(seenRecently(state, 'A', TTL), true)
  assert.equal(seenRecently(state, 'B', TTL), true)
}))

test('ttl expiry allows re-injection', () => scratch(root => {
  const state = join(root, 'seen.json')
  markSeen(state, 'A', TTL, { now: 1000 })
  assert.equal(seenRecently(state, 'A', TTL, { now: 1000 + TTL - 1 }), true)
  assert.equal(seenRecently(state, 'A', TTL, { now: 1000 + TTL }), false)
}))

test('cap evicts oldest entries only', () => scratch(root => {
  const state = join(root, 'seen.json')
  markSeen(state, 'k1', TTL, { cap: 2, now: 1 })
  markSeen(state, 'k2', TTL, { cap: 2, now: 2 })
  markSeen(state, 'k3', TTL, { cap: 2, now: 3 })
  assert.equal(seenRecently(state, 'k1', TTL, { now: 1000 }), false, 'oldest evicted')
  assert.equal(seenRecently(state, 'k2', TTL, { now: 1000 }), true)
  assert.equal(seenRecently(state, 'k3', TTL, { now: 1000 }), true)
}))

test('corrupt state file behaves like empty set', () => scratch(root => {
  const state = join(root, 'seen.json')
  writeFileSync(state, '{not json')
  assert.equal(seenRecently(state, 'A', TTL), false)
  markSeen(state, 'A', TTL)
  assert.equal(seenRecently(state, 'A', TTL), true)
}))
