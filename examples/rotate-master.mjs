#!/usr/bin/env node
/**
 * rotate-master — 每日主对话自动轮换（早 8 点，launchd 承载）。
 *
 * 流程：创建今日新主会话 → 清理卸任会话私有调度（防双跑）→
 *       注入交接简报（目标池/关键人/纪律/重建清单）→
 *       重指 5 个会话相关 plist（ops-warden-trigger/message-triage/stall-patrol/gate/reflect）→ 更新 master-session.json。
 * 用户晨间打开 App 即看到已就绪的新对话，直接对话即可（首条消息=目标挂载授权）。
 * 旧会话归档不删。
 *
 * 幂等：master-session.json 记录今日已轮换则跳过。
 */
import { callRpc } from './lib/dsh-client.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const URL_ = process.env.MUSE_URL ?? 'http://127.0.0.1:19387'
const HOME = process.env.HOME ?? homedir()
const projectDir = join(HOME, 'Projects', 'dsh-muse')
const statePath = join(HOME, '.dsh', 'muse', 'master-session.json')
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) // 本地(+08)日期

// ---- 幂等 ----
let state = { masterSession: '', date: '', history: [] }
try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}

// ---- 0. dry-run：只打印计划，零副作用（--dry-run）----
if (process.argv.includes('--dry-run')) {
  let n = '?'
  try {
    const items = state.masterSession ? await callRpc(URL_, 'schedule/list', { sessionId: state.masterSession }) : []
    n = String(Array.isArray(items) ? items.length : '?')
  } catch { /* 卸任会话不可达时显示 ? */ }
  console.log(`rotate(dry-run): today=${today} state.date=${state.date || '(空)'} state.master=${state.masterSession || '(空)'}`)
  console.log(state.date === today
    ? 'rotate(dry-run): 将跳过（今日已轮换）'
    : `rotate(dry-run): 将新建主会话 + 清理卸任会话 ${state.masterSession || '(无)'} 的 ${n} 条调度 + 注入简报 + 重指 5 plist + 落盘`)
  process.exit(0)
}

if (state.date === today) { console.log('rotate: 今日已轮换，跳过'); process.exit(0) }

// ---- 1. 创建新主会话 ----
// 标题标记：侧边栏一眼可辨主控/退役（2026-10-07 用户反馈分不清哪个是主控对话）
async function markTitle(sessionId, prefix, fallback) {
  try {
    const list = await callRpc(URL_, 'session/list', {})
    const arr = Array.isArray(list) ? list : (list?.sessions ?? [])
    const old = arr.find(s => s.sessionId === sessionId)?.projections?.values?.title ?? ''
    const base = old.replace(/^【[^】]*】/, '') || fallback
    await callRpc(URL_, 'session/rename', { sessionId, title: prefix + base })
    console.log(`rotate: 标题标记 → 「${prefix}${base}」`)
  } catch (e) { console.error('rotate: 标题标记失败（不阻断）:', String(e).slice(0, 120)) }
}
const created = await callRpc(URL_, 'session/create', { cwd: projectDir })
const newId = created.sessionId
console.log('rotate: 新会话', newId)
await markTitle(newId, '【主控】', 'Muse 今日主控对话')

// ---- 2. 清理卸任会话的私有调度（防跨日双跑；2026-10-07 交接遗留修复）----
// 卸任主控的 3 条每日调度若不删，与新会话重建的调度 9:30 起双跑。
const outgoing = state.masterSession
if (outgoing && outgoing !== newId) {
  try {
    const items = await callRpc(URL_, 'schedule/list', { sessionId: outgoing })
    for (const s of Array.isArray(items) ? items : []) {
      const r = await callRpc(URL_, 'schedule/delete', { id: s.id, sessionId: outgoing }, 'request')
      console.log(`rotate: 卸任调度 ${r?.deleted ? '已删' : `跳过(${r?.code ?? 'unknown'})`} ${s.id}${s.title ? ` [${s.title}]` : ''}`)
    }
    console.log(`rotate: 卸任会话 ${outgoing} 调度清理完成（${Array.isArray(items) ? items.length : 0} 条）`)
    await markTitle(outgoing, '【已退役·前主控】', 'Muse 旧主控')
  } catch (e) {
    // 清理失败不阻断轮换：宁可单日双跑（可人工删），不可全天无主控
    console.error('rotate: 卸任调度清理失败（不阻断轮换）:', String(e).slice(0, 160))
  }
}

// ---- 4. 注入交接简报 ----
let pool = {}
try { pool = JSON.parse(readFileSync(join(HOME, '.dsh', 'muse', 'goal-pool.json'), 'utf8')) } catch {}
const brief = `【晨间交接——你是今天的主控 Muse】（${today}）

新的一天，主对话已为你备好。上下文要点：
1. 目标池（~/.dsh/muse/goal-pool.json，用户全部长期目标）：armed = ${pool.armed?.goal ?? 'dsh-muse 打磨'}；queued ${pool.queued?.length ?? 0} 个见文件
2. 关键人（老婆/青山/菜花/轮子，注册表 ~/.dsh/muse/key-people.json）与全部纪律已在你收到的记忆注入中
3. 开工动作（按 docs/master-session-rotation.md）：用 schedule_create 重建 4 个调度（9:30 对标 / 20:35 总结 / 周日 20:10 周报 / 周日 21:00 元复盘，prompt 在手册附录 A-D）；按 ~/.dsh/muse/ops-warden-charter.md 用 spawn_teammate 重生 ops-warden 成员（ops-warden-trigger 的 plist 已重指本会话，9:05 路由到无成员会话会空转）；goal 挂载等用户首条消息授权，无事时按轮次纪律置 blocked 进守望
4. 用户偏好：中文、简洁、静默=主对话零消息、白天自测可围观、诚实不编造
5. 前一天的工作档案：demo-journal.md 与 docs/evolution/（21 轮账本）

完成重建后向用户问好即可。今天是新的一页，使命不变。`
await callRpc(URL_, 'session/prompt', {
  requestId: crypto.randomUUID?.() ?? String(Date.now()),
  sessionId: newId, mode: 'queue',
  content: [{ type: 'text', text: brief }],
})

// ---- 5. 重指五个 plist（reflect 于 2026-10-08 从 ~/Library 迁入正本，修其跨轮换漏指）----
for (const name of ['ops-warden-trigger', 'message-triage', 'stall-patrol', 'gate', 'reflect']) {
  const plist = join(projectDir, 'examples', `${name}.plist`)
  if (!existsSync(plist)) continue
  try {
    execSync(`launchctl bootout gui/$(id -u)/com.dsh-muse.${name} 2>/dev/null; true`, { shell: '/bin/bash' })
    let t = readFileSync(plist, 'utf8')
    t = t.replace(/<string>session-[0-9a-f-]+<\/string>/, `<string>${newId}</string>`)
    writeFileSync(plist, t)
    execSync(`launchctl bootstrap gui/$(id -u) ${plist}`, { shell: '/bin/bash', stdio: 'ignore' })
    console.log(`rotate: ${name} plist 已重指`)
  } catch (e) { console.error(`rotate: ${name} 重指失败:`, String(e).slice(0, 120)) }
}

// ---- 6. 状态落盘 ----
state.history.push({ date: state.date, masterSession: state.masterSession })
state.masterSession = newId
state.date = today
writeFileSync(statePath, JSON.stringify(state, null, 2))
console.log('rotate: 完成——今日主会话', newId)
