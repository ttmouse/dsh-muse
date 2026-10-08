/** Persistent seen-set: inject-at-most-once per key within TTL, cap-bounded, crash-tolerant.
 *  Replaces capacity-1 single-hash dedup (message-triage) that let alternating batches re-inject.
 *  State file: JSON array of [key, timestampMs] pairs; corrupt file == empty set.
 *
 *  markSeenMany / markSeen 一律不抛错：记账发生在投递成功之后，写盘失败绝不能让
 *  进程以非 0 退出、留下满屏堆栈，更不能回头覆盖那一次已经成功的投递。
 *  2026-10-08 实测样本：宿主 20:15 重启后 restart-recover 每 10 分钟一拍，投递成功、
 *  随后标记阶段写盘超时抛 DOMException 冲出主流程。 */
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

/**
 * 标记一批键为已见，一次写盘。永不抛错：失败只记一行 stderr（退化为「这一轮没记住」，
 * 下一拍可能重报一次，代价远小于让脚本崩在收尾步骤）。
 * @returns 是否写盘成功
 */
export function markSeenMany(statePath, keys, ttlMs, { cap = 50, now = Date.now() } = {}) {
  try {
    const list = [...keys]
    const entries = prune(load(statePath), ttlMs, now).filter(([k]) => !list.includes(k))
    for (const k of list) entries.push([k, now])
    mkdirSync(dirname(statePath), { recursive: true })
    writeFileSync(statePath, JSON.stringify(entries.slice(-Math.max(cap, list.length))))
    return true
  } catch (e) {
    console.error(`seen-set: 标记已见失败（${String(e?.message ?? e).slice(0, 120)}）——本轮不记账，下一拍可能重报一次`)
    return false
  }
}

export function markSeen(statePath, key, ttlMs, options = {}) {
  return markSeenMany(statePath, [key], ttlMs, options)
}
