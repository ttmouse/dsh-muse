#!/usr/bin/env node
/**
 * restart-recover — 桌面客户端重启后，把「重启之前进行中、但从未收口」的对话找出来交给主控恢复。
 *
 * 与 stall-patrol 的分工：stall-patrol 是每小时按 goal/todos/inbox 静态信号巡查「断线任务」；
 * 本脚本补的是它看不见的一类——**没有任何 goal/todos 痕迹、纯粹的进行中对话**：用户发了话、
 * 轮次刚开，进程就随重启消失，转录里没有 turn/end，也不会进 stall-patrol 的任一信号。
 *
 * 数据源：session/list（分页普查）+ 每个会话的投影缓存
 *   ~/.dsh/storages/session_projcache/sessions/<sessionId>.json → turnBoundary.openTurnStartSeq
 * 判据与去重见 examples/lib/restart-recover.mjs 头注。
 *
 * 重启识别：宿主进程身份（监听 19387 的 pid + 其启动时间）落在
 * ~/.dsh/muse/host-identity.json；pid/启动时间变化即一次重启。身份拿不到时不猜测、
 * 静默退出（下一个周期再试），绝不把「拿不到进程信息」当成「没有重启」写进状态。
 *
 * 授权链：用户 2026-10-08 18:42 在看板议题「桌面客户端重启之后，我希望主控能够帮我去恢复，
 * 就是在重启之前的进行中的对话」直接要求；主控恢复动作（推活/转告用户）的判断权仍在主控。
 *
 * launchd 传参：无（环境变量 MUSE_SESSION_ID=主控会话, MUSE_URL）。
 * --dry-run 只打印计划零投递（有副作用的脚本诞生即带降落伞）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { callRpc } from './lib/dsh-client.mjs'
import { deliverToMaster } from './lib/master-channel.mjs'
import { seenRecently, markSeen, markSeenMany } from './lib/seen-set.mjs'
import { classifyInterrupted, seenKeyOf, reportTtlMs, buildBrief, detectRestart } from './lib/restart-recover.mjs'

const URL_ = process.env.MUSE_URL ?? 'http://127.0.0.1:19387'
const HOME = process.env.HOME ?? homedir()
const MUSE_DIR = join(HOME, '.dsh', 'muse')
const PROJ_DIR = join(HOME, '.dsh', 'storages', 'session_projcache', 'sessions')
const dryRun = process.argv.includes('--dry-run')
const WINDOW_H = Number(process.env.RESTART_RECOVER_WINDOW_H ?? 72)
const GRACE_MIN = Number(process.env.RESTART_RECOVER_GRACE_MIN ?? 2)

// ---- 主控会话 ----
let masterId = process.env.MUSE_SESSION_ID ?? ''
if (!masterId) {
  try { masterId = JSON.parse(readFileSync(join(MUSE_DIR, 'master-session.json'), 'utf8')).masterSession ?? '' } catch {}
}
if (!masterId) {
  console.log('restart-recover: 无主控会话登记，退出')
  process.exit(0)
}

// ---- 宿主进程身份（监听 19387 的 pid + 启动时间）----
function hostIdentity() {
  let pid = ''
  try { pid = execFileSync('/usr/sbin/lsof', ['-nP', '-iTCP:19387', '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split('\n')[0] } catch { return null }
  if (!/^\d+$/.test(pid)) return null
  let startedAt = 0
  try {
    const out = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', pid], { encoding: 'utf8' }).trim()
    startedAt = Date.parse(out)
  } catch { return null }
  if (!Number.isFinite(startedAt)) return null
  return { pid: Number(pid), startedAt }
}

const identity = hostIdentity()
if (!identity) {
  // 宿主没在跑（用户退出了客户端）或进程信息不可得：不写状态、不猜测，下一拍再试
  console.log('restart-recover: 未能取得宿主进程身份（19387 未监听或无权限），本轮跳过')
  process.exit(0)
}

const identityPath = join(MUSE_DIR, 'host-identity.json')
let prevIdentity
try { prevIdentity = JSON.parse(readFileSync(identityPath, 'utf8')) } catch {}
const restart = detectRestart(prevIdentity, identity)

// ---- 全量分页普查 ----
// 宿主未就绪（刚重启、19387 无响应）时 callRpc 会在 15 秒超时抛 DOMException——
// 这是主流程第一处 await，不加防线就整脚本崩栈、退出码非 0。本拍跳过即可：
// 不写状态、不记账，下一个 10 分钟周期自然重试。
// 2026-10-08 实测样本：宿主 20:15 重启后一段时间 19387 不响应，日志连出两次 DOMException 堆栈。
let cursor, all = [], pages = 0
try {
  do {
    const res = await callRpc(URL_, 'session/list', cursor ? { cursor: String(cursor) } : {})
    const items = Array.isArray(res?.items) ? res.items : []
    all = all.concat(items)
    cursor = res?.hasMore ? res.cursor : undefined
    if (++pages > 50) break
  } while (cursor)
} catch (e) {
  console.error(`restart-recover: 宿主未就绪，本拍跳过（${String(e?.message ?? e).slice(0, 160)}）`)
  process.exit(0)
}
if (!all.length) {
  console.error('restart-recover: 会话列表为空（宿主可能正在启动），本拍跳过')
  process.exit(0)
}

// ---- 只对「可能入选」的会话读投影缓存（749 个文件全读没必要）----
const now = Date.now()
function openTurnStartSeqOf(sessionId) {
  const file = join(PROJ_DIR, `${sessionId}.json`)
  if (!existsSync(file)) return undefined
  try {
    const val = JSON.parse(readFileSync(file, 'utf8'))?.record?.rows?.turnBoundary?.val
    return { openTurnStartSeq: val?.openTurnStartSeq ?? null, openStep: val?.lastStepBoundary?.kind === 'start' }
  } catch { return undefined }
}

const entries = []
let scanned = 0
for (const s of all) {
  if (s.blank || s.running) continue
  if (s.sessionId === masterId) continue
  if (!(s.updatedAt < identity.startedAt)) continue
  const idleMin = (now - s.updatedAt) / 6e4
  if (idleMin < GRACE_MIN || idleMin > WINDOW_H * 60) continue
  const turn = openTurnStartSeqOf(s.sessionId)
  if (turn === undefined) continue
  scanned++
  entries.push({
    sessionId: s.sessionId, updatedAt: s.updatedAt, running: s.running, blank: s.blank,
    cwd: s.cwd ?? '', title: s.projections?.values?.title ?? '',
    openTurnStartSeq: turn.openTurnStartSeq, openStep: turn.openStep,
  })
}

const candidates = classifyInterrupted(entries, { hostStartedAt: identity.startedAt, now, windowH: WINDOW_H, masterId, graceMin: GRACE_MIN })

const report = {
  at: new Date().toISOString(),
  host: identity,
  previousHost: prevIdentity ?? null,
  restart,
  total: all.length,
  scanned,
  candidates: candidates.length,
}

if (dryRun) {
  console.log(`restart-recover(dry-run): 普查 ${all.length} 会话，读投影 ${scanned} 个，候选 ${candidates.length}`)
  console.log(`  宿主 pid=${identity.pid} 启动于 ${new Date(identity.startedAt).toISOString()}；重启判定=${restart.changed}（${restart.reason}）`)
  for (const c of candidates) console.log(' ', [c.sessionId, c.idleMin + 'min', c.openStep ? 'step-open' : 'turn-open', c.title].join(' | '))
  if (candidates.length) console.log('--- 将投递 ---\n' + buildBrief(candidates, { total: all.length, scanned, restart, windowH: WINDOW_H }))
  process.exit(0)
}

// ---- 宿主身份落盘（只在真跑时写，dry-run 不留痕）----
mkdirSync(MUSE_DIR, { recursive: true })
writeFileSync(identityPath, JSON.stringify({ ...identity, recordedAt: new Date().toISOString() }, null, 2))

const seenPath = join(MUSE_DIR, 'restart-recover-seen.json')
// 去重集读取失败时按空集处理（seenRecently 内部已容错），但要留痕：
// 读不到会让同一批候选再报一次，与 stall-patrol 的「静默退出」日志形状不同，便于事后分辨。
let fresh
try {
  fresh = candidates.filter(c => !seenRecently(seenPath, seenKeyOf(c), reportTtlMs()))
} catch (e) {
  console.error(`restart-recover: 去重集不可用（${String(e?.message ?? e).slice(0, 120)}），本拍按空集处理`)
  fresh = candidates
}
report.reported = fresh.length
report.suppressed = candidates.length - fresh.length

if (!fresh.length) {
  try { writeFileSync(join(MUSE_DIR, 'restart-recover.json'), JSON.stringify(report, null, 2)) } catch (e) { console.error('restart-recover: 报告落盘失败', String(e?.message ?? e).slice(0, 120)) }
  console.log('restart-recover: 候选', candidates.length, '（去重窗内已报过），静默退出')
  process.exit(0)
}

const brief = buildBrief(fresh, { total: all.length, scanned, restart, windowH: WINDOW_H })
// 投递失败绝不当成已报：退回未标记状态，下一拍重试（否则这一批中断对话静默丢失）。
let via
try {
  via = await deliverToMaster({ url: URL_, home: HOME, masterId, brief, tag: 'restart-recover' })
} catch (e) {
  report.via = 'failed'
  report.error = String(e?.message ?? e).slice(0, 200)
  try { writeFileSync(join(MUSE_DIR, 'restart-recover.json'), JSON.stringify(report, null, 2)) } catch {}
  console.error(`restart-recover: 投递失败，本拍不记账、下一拍重试——${report.error}`)
  process.exit(0)
}
report.via = via

// 先投递成功、后记账；记账失败由 markSeenMany 自己吞掉并提醒（见 seen-set 头注）。
markSeenMany(seenPath, fresh.map(seenKeyOf), reportTtlMs(), { cap: 50 })
try { writeFileSync(join(MUSE_DIR, 'restart-recover.json'), JSON.stringify(report, null, 2)) } catch (e) { console.error('restart-recover: 报告落盘失败', String(e?.message ?? e).slice(0, 120)) }
console.log('restart-recover: 已上报', fresh.length, '个中断对话（普查', all.length, '会话，通道', via, '）')
