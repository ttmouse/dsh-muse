#!/usr/bin/env node
/**
 * stall-patrol — 主控巡查：发现桌面客户端重启/轮换/中断后「断掉的对话」并上报主控。
 *
 * 数据源：session/list 全量分页（每会话含 updatedAt/running/blank/title/goal/todos/inbox 投影）。
 * 断线信号：
 *   - stalled-goal     带 goal 且 phase=active 但 running=false 闲置超阈值（驱动停转的僵尸）
 *   - blocked-goal     带 goal 且 phase=blocked（需要人类直接话语权恢复，主控只能转告用户）
 *   - stalled-todos    未完 todos 且 running=false（任务做到一半断掉）
 *   - stalled-inbox    inbox 有排队未消费且 running=false（注入卡在半路）
 * 判定纪律：
 *   - 排除自身（master-session.json 的 masterSession）、blank、24h 外、标题带 已退役/已废弃/已归档
 *   - 同一 goalId 多会话 → 只留最新为 canonical，其余记 duplicate（防止推活造成目标再分叉）
 * 上报：仅当有候选时投递（静默纪律：无候选零打扰）；投递通道见下方「投递通道」注释；
 *       seen-set 去重（普通候选 6h；blocked-goal 按 goal revision
 *       压制 7 天；duplicate-goal 同样 7 天），统计落 ~/.dsh/muse/stall-patrol.json（含 suppressed/via）。
 * 授权链：用户 2026-10-07 直接指示主控巡查并推动断线对话；goal 的 resume 仍受 keeper
 *       人类话语权边界约束——blocked 类只转告用户，不代劳。
 *
 * launchd 传参：无（环境变量 MUSE_SESSION_ID=主控会话, MUSE_URL）。
 * --dry-run 只打印计划零注入（有副作用的脚本诞生即带降落伞）。
 */
import { callRpc } from './lib/dsh-client.mjs'
import { deliverToMaster } from './lib/master-channel.mjs'
import { seenRecently, markSeen } from './lib/seen-set.mjs'
import { classifySessions, reportKey, reportTtlMs } from './lib/stall-classify.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const URL_ = process.env.MUSE_URL ?? 'http://127.0.0.1:19387'
const HOME = process.env.HOME ?? homedir()
const dryRun = process.argv.includes('--dry-run')
const IDLE_MIN = Number(process.env.STALL_IDLE_MIN ?? 30)
const WINDOW_H = Number(process.env.STALL_WINDOW_H ?? 24)

// 夜间静默（本地时区 0-8 点跳过）；--force 或 STALL_NO_NIGHT_SKIP=1 可越过
if (!dryRun && !process.argv.includes('--force') && process.env.STALL_NO_NIGHT_SKIP !== '1') {
  const h = new Date(Date.now() + 8 * 3600e3).getUTCHours()
  if (h < 8) { console.log('stall-patrol: 夜间静默，跳过'); process.exit(0) }
}

// ---- 主控会话（排除自身）----
let masterId = ''
try { masterId = JSON.parse(readFileSync(join(HOME, '.dsh', 'muse', 'master-session.json'), 'utf8')).masterSession ?? '' } catch {}

// ---- 全量分页普查 ----
let cursor, all = [], pages = 0
do {
  const res = await callRpc(URL_, 'session/list', cursor ? { cursor: String(cursor) } : {})
  const items = Array.isArray(res?.items) ? res.items : []
  all = all.concat(items)
  cursor = res?.hasMore ? res.cursor : undefined
  if (++pages > 50) break
} while (cursor)

const candidates = classifySessions(all, { masterId, now: Date.now(), idleMinMin: IDLE_MIN, windowH: WINDOW_H })

if (dryRun) {
  console.log(`stall-patrol(dry-run): 普查 ${all.length} 会话，候选 ${candidates.length}`)
  for (const c of candidates) console.log(' ', [c.kind, c.sessionId.slice(8, 20), c.idleMin + 'min', c.canonical === false ? '[dup]' : '', c.title].join(' | ').replace(' | ', ' | ').trim())
  process.exit(0)
}

// ---- seen-set 去重后上报（duplicate-goal / blocked-goal 长窗压制，防止重复打扰）----
const seenPath = join(HOME, '.dsh', 'muse', 'stall-patrol-seen.json')
const fresh = candidates.filter(c => !seenRecently(seenPath, reportKey(c), reportTtlMs(c)))
if (!fresh.length) {
  writeFileSync(join(HOME, '.dsh', 'muse', 'stall-patrol.json'), JSON.stringify({ at: new Date().toISOString(), total: all.length, candidates: candidates.length, reported: 0, suppressed: candidates.length, detail: candidates }, null, 2))
  console.log('stall-patrol: 候选', candidates.length, '（均已在去重窗内上报过），静默退出')
  process.exit(0)
}

// 上报主控：判断权在主控（能否自动推活取决于各会话授权状态；blocked 类只能转告用户）
const lines = fresh.map(c => `- ${c.sessionId}｜${c.kind}${c.canonical === false ? '（同目标重复会话，勿推活，留档待归档）' : ''}｜闲置 ${c.idleMin} 分钟｜${c.title}｜cwd ${c.cwd}`)
const brief = `【主控巡查·断线候选】${fresh.length} 个会话疑似中断停转（阈值 ${IDLE_MIN} 分钟，窗口 ${WINDOW_H}h，普查 ${all.length} 会话）：\n${lines.join('\n')}\n判断与处置：canonical 的 stalled-goal/stalled-todos/stalled-inbox → 用 session/prompt 注入「继续」推动续跑并 journal 记一行；blocked-goal → 平台边界内不能代劳 resume，等用户本人发话；duplicate-goal → 不推活。处置完无需向用户逐条汇报，除非出现 A 类（目标分叉/数据风险/机制失效）。`
/* 投递通道见 examples/lib/master-channel.mjs（2026-10-08 抽出与 restart-recover 共用）：
 * 主控持有常驻自治时走站内信箱（keeper 注入，渲染为折叠卡片「收到执行请求」），
 * 未授权则回退直投主控（session/prompt）。 */
const deliveredVia = await deliverToMaster({ url: URL_, home: HOME, masterId, brief, tag: 'stall-patrol' })

for (const c of fresh) markSeen(seenPath, reportKey(c), reportTtlMs(c), { cap: 50 })
mkdirSync(join(HOME, '.dsh', 'muse'), { recursive: true })
writeFileSync(join(HOME, '.dsh', 'muse', 'stall-patrol.json'), JSON.stringify({ at: new Date().toISOString(), total: all.length, candidates: candidates.length, reported: fresh.length, suppressed: candidates.length - fresh.length, via: deliveredVia, detail: fresh }, null, 2))
console.log('stall-patrol: 已上报', fresh.length, '个候选（普查', all.length, '会话，通道', deliveredVia, '）')
