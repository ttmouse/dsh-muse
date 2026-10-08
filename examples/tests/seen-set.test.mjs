import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seenRecently, markSeen, markSeenMany } from '../lib/seen-set.mjs'

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

// 2026-10-08 事故回归：restart-recover 投递成功后标记阶段写盘抛错（DOMException 超时）
// 冲出主流程，日志满屏堆栈、退出码非 0。记账失败必须只退化为「这一轮没记住」。
test('markSeenMany writes a whole batch at once', () => scratch(root => {
  const state = join(root, 'seen.json')
  assert.equal(markSeenMany(state, ['a', 'b', 'c'], TTL), true)
  for (const k of ['a', 'b', 'c']) assert.equal(seenRecently(state, k, TTL), true)
  assert.equal(seenRecently(state, 'd', TTL), false)
}))

test('markSeenMany keeps every key of an oversized batch (no cap truncation)', () => scratch(root => {
  const state = join(root, 'seen.json')
  const keys = Array.from({ length: 8 }, (_, i) => `k${i}`)
  markSeenMany(state, keys, TTL, { cap: 2 })
  for (const k of keys) assert.equal(seenRecently(state, k, TTL), true, `${k} 必须被记住`)
}))

test('markSeen does not throw when the state path is unwritable', () => scratch(root => {
  // 把状态文件放到一个「同名目录」下：写盘必然失败（EISDIR），模拟超时/权限类写失败
  const dir = join(root, 'as-directory')
  mkdirSync(dir)
  assert.doesNotThrow(() => markSeen(dir, 'A', TTL))
  assert.equal(markSeen(dir, 'A', TTL), false, '失败要返回 false 供调用方判断')
}))

test('markSeenMany does not throw when a parent path is a file', () => scratch(root => {
  const blocked = join(root, 'file-not-dir')
  writeFileSync(blocked, 'x')
  assert.doesNotThrow(() => markSeenMany(join(blocked, 'seen.json'), ['A', 'B'], TTL))
}))
