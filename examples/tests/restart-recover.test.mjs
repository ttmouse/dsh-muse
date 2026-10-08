import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { classifyInterrupted, seenKeyOf, reportTtlMs, detectRestart, buildBrief, REPORT_TTL_MS } from '../lib/restart-recover.mjs'
import { seenRecently, markSeen } from '../lib/seen-set.mjs'

const NOW = 1_800_000_000_000
const HOST_START = NOW - 60 * 60_000 // 宿主一小时前启动
const min = m => NOW - m * 60_000

/** 会话条目工厂：默认「宿主启动前就开着轮次、闲置 2 小时」= 应入选；override 覆盖字段。 */
function entry(over = {}) {
  return {
    sessionId: 'session-' + Math.random().toString(16).slice(2, 10),
    updatedAt: min(120),
    running: false, blank: false, cwd: '/tmp',
    title: '普通工作会话',
    openTurnStartSeq: 4,
    openStep: true,
    ...over,
  }
}
const opts = { hostStartedAt: HOST_START, now: NOW, masterId: 'session-m', windowH: 72 }

test('真样本形状入选：轮次开在重启前、从未收口（session-e6fe5d11 线上样本）', () => {
  const out = classifyInterrupted([entry({ sessionId: 'session-e6fe5d11', title: '梳理插件相关实现与实际效果' })], opts)
  assert.equal(out.length, 1)
  assert.equal(out[0].kind, 'interrupted-turn')
  assert.equal(out[0].openTurnStartSeq, 4)
  assert.equal(out[0].openStep, true)
})

test('轮次已收口（openTurnStartSeq 为 null）不入选——闭环会话不得误报', () => {
  assert.equal(classifyInterrupted([entry({ openTurnStartSeq: null })], opts).length, 0)
  assert.equal(classifyInterrupted([entry({ openTurnStartSeq: undefined })], opts).length, 0)
})

test('running=true（正在执行）与 blank 排除', () => {
  assert.equal(classifyInterrupted([entry({ running: true })], opts).length, 0)
  assert.equal(classifyInterrupted([entry({ blank: true })], opts).length, 0)
})

test('本纪元内开的新轮不算重启遗留（updatedAt >= 宿主启动时间）', () => {
  const inEpoch = entry({ updatedAt: NOW - 5 * 60_000 }) // 宿主启动之后
  assert.equal(classifyInterrupted([inEpoch], opts).length, 0)
  // 恰好等于宿主启动时刻：不属于「早于」，不入选
  assert.equal(classifyInterrupted([entry({ updatedAt: HOST_START })], opts).length, 0)
})

test('宽限与窗口边界：刚发生的不判定、超过窗口的不打扰', () => {
  assert.equal(classifyInterrupted([entry({ updatedAt: NOW - 60_000 })], opts).length, 0, '1 分钟前刚死，留宽限')
  assert.equal(classifyInterrupted([entry({ updatedAt: min(73 * 60) })], opts).length, 0, '73 小时前超窗')
  const edge = classifyInterrupted([entry({ updatedAt: min(72 * 60) })], opts)
  assert.equal(edge.length, 1, '窗口边缘仍入选')
})

test('主控自身与已退役/已废弃/已归档标题排除', () => {
  const out = classifyInterrupted([
    entry({ sessionId: 'session-m' }),
    entry({ title: '【已退役·前主控】Muse 旧主控' }),
    entry({ title: '【已废弃】某会话' }),
    entry({ title: '【已归档】某会话' }),
  ], opts)
  assert.equal(out.length, 0)
})

test('按闲置时长升序（最该先救的排最前）', () => {
  const out = classifyInterrupted([
    entry({ sessionId: 'session-a', updatedAt: min(600) }),
    entry({ sessionId: 'session-b', updatedAt: min(90) }),
  ], opts)
  assert.deepEqual(out.map(c => c.sessionId), ['session-b', 'session-a'])
})

test('去重键含 openTurnStartSeq：同一轮只报一次，新轮重新上报', () => {
  const c = { sessionId: 'session-x', openTurnStartSeq: 42 }
  assert.equal(seenKeyOf(c), 'session-x:interrupted-turn:42')
  assert.notEqual(seenKeyOf(c), seenKeyOf({ ...c, openTurnStartSeq: 43 }), '推活后再次死在新轮次 → 键变化 → 重新上报')
})

test('压制窗 7 天：同一未收口轮次 6 小时后仍被压制', () => {
  assert.equal(reportTtlMs(), REPORT_TTL_MS.long)
  const statePath = join(tmpdir(), `restart-recover-seen-${process.pid}-${Math.random().toString(16).slice(2)}.json`)
  try {
    const key = seenKeyOf({ sessionId: 'session-y', openTurnStartSeq: 7 })
    assert.equal(seenRecently(statePath, key, reportTtlMs()), false)
    markSeen(statePath, key, reportTtlMs())
    assert.equal(seenRecently(statePath, key, reportTtlMs(), { now: Date.now() + 6 * 3600e3 }), true)
  } finally { rmSync(statePath, { force: true }) }
})

test('重启判定：首次运行不算重启；pid 变化算；pid 复用但启动时间变算', () => {
  const cur = { pid: 48109, startedAt: NOW }
  assert.deepEqual(detectRestart(undefined, cur), { changed: false, reason: 'no-identity' })
  assert.equal(detectRestart({ pid: 48081, startedAt: NOW - 1000 }, cur).changed, true)
  assert.equal(detectRestart({ pid: 48109, startedAt: NOW }, cur).changed, false)
  assert.equal(detectRestart({ pid: 48109, startedAt: NOW - 999 }, cur).reason, 'pid-reused-new-start')
})

test('简报文本含会话 id/闲置分钟/标题，且带上处置口径', () => {
  const brief = buildBrief([{ sessionId: 'session-e6fe5d11', idleMin: 1250, openStep: true, title: '梳理插件实现', cwd: '/Users/douba/Projects/dsh-muse' }], { total: 874, scanned: 12, restart: { changed: true, reason: 'pid-changed' }, windowH: 72 })
  assert.match(brief, /session-e6fe5d11/)
  assert.match(brief, /1250 分钟/)
  assert.match(brief, /梳理插件实现/)
  assert.match(brief, /session\/prompt/)
  assert.match(brief, /pid-changed/)
})

// 2026-10-08 事故回归：宿主 20:15 重启后 19387 不响应，callRpc 15 秒超时抛 DOMException，
// 崩在主流程第一处 await（普查分页），整脚本退出码非 0、日志连出堆栈。
// 这里盯住「普查失败 = 静默跳过」这条契约：脚本源码不得再出现裸的 await callRpc(session/list)。
test('普查阶段必须自带防线：session/list 的 await 被 try/catch 包住且失败即 exit 0', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../restart-recover.mjs', import.meta.url), 'utf8')
  const at = src.indexOf("callRpc(URL_, 'session/list'")
  assert.notEqual(at, -1, '普查调用应存在')
  // 往前找最近的 try {，往后确认同一块里有 catch → exit 0
  const head = src.slice(0, at)
  const tryIdx = head.lastIndexOf('try {')
  assert.notEqual(tryIdx, -1, '普查调用必须在 try 块内')
  const tail = src.slice(at)
  const catchIdx = tail.indexOf('catch')
  assert.notEqual(catchIdx, -1, '普查失败必须有 catch')
  const guard = tail.slice(catchIdx, catchIdx + 400)
  assert.match(guard, /宿主未就绪/, 'catch 里要写明「宿主未就绪」')
  assert.match(guard, /process\.exit\(0\)/, 'catch 里必须干净退出，不得抛栈')
})

// 2026-10-09 回归（人类提问「如果检测到没有对话的话，还会发起吗？」）：
// 契约是「零候选 ⇒ 不投递」，且日志必须说清是「没扫到」而不是「已报过」。
// 源码级断言：投递调用只出现在 return 之后的无候选短路分支之外。
test('零候选短路：不投递，且日志区分「无中断对话」与「已报过」', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../restart-recover.mjs', import.meta.url), 'utf8')
  const at = src.indexOf('if (!fresh.length) {')
  assert.notEqual(at, -1, '零候选短路分支应存在')
  const branchEnd = src.indexOf('process.exit(0)', at)
  assert.notEqual(branchEnd, -1, '短路分支必须 exit 0')
  const branch = src.slice(at, branchEnd)
  assert.doesNotMatch(branch, /deliverToMaster/, '零候选分支里不得出现投递调用')
  assert.match(branch, /本拍无中断对话/, '零候选要说清「没扫到」')
  assert.match(branch, /去重窗内已报过/, '有候选但被压制时才说「已报过」')
  // 投递调用必须排在短路分支之后，零候选永远走不到它
  assert.ok(src.indexOf('deliverToMaster(') > branchEnd, '投递只能在零候选短路之后执行')
})
