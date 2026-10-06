#!/usr/bin/env node
/**
 * rotate-master — 每日主对话自动轮换（早 8 点，launchd 承载）。
 *
 * 流程：创建今日新主会话 → 注入交接简报（目标池/关键人/纪律/重建清单）→
 *       重指 ops-warden-trigger 与 message-triage 的 plist → 更新 master-session.json。
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
if (state.date === today) { console.log('rotate: 今日已轮换，跳过'); process.exit(0) }

// ---- 1. 创建新主会话 ----
const created = await callRpc(URL_, 'session/create', { cwd: projectDir })
const newId = created.sessionId
console.log('rotate: 新会话', newId)

// ---- 2. 注入交接简报 ----
let pool = {}
try { pool = JSON.parse(readFileSync(join(HOME, '.dsh', 'muse', 'goal-pool.json'), 'utf8')) } catch {}
const brief = `【晨间交接——你是今天的主控 Muse】（${today}）

新的一天，主对话已为你备好。上下文要点：
1. 目标池（~/.dsh/muse/goal-pool.json，用户全部长期目标）：armed = ${pool.armed?.goal ?? 'dsh-muse 打磨'}；queued ${pool.queued?.length ?? 0} 个见文件
2. 关键人（老婆/青山/菜花/轮子，注册表 ~/.dsh/muse/key-people.json）与全部纪律已在你收到的记忆注入中
3. 开工动作（按 docs/master-session-rotation.md 附录）：用 schedule_create 重建 3 个每日调度（对标 9:30 / 总结 20:35，prompt 在手册附录）；goal 挂载等用户首条消息授权
4. 用户偏好：中文、简洁、静默=主对话零消息、白天自测可围观、诚实不编造
5. 前一天的工作档案：demo-journal.md 与 docs/evolution/（21 轮账本）

完成重建后向用户问好即可。今天是新的一页，使命不变。`
await callRpc(URL_, 'session/prompt', {
  requestId: crypto.randomUUID?.() ?? String(Date.now()),
  sessionId: newId, mode: 'queue',
  content: [{ type: 'text', text: brief }],
})

// ---- 3. 重指两个 plist ----
for (const name of ['ops-warden-trigger', 'message-triage']) {
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

// ---- 4. 状态落盘 ----
state.history.push({ date: state.date, masterSession: state.masterSession })
state.masterSession = newId
state.date = today
writeFileSync(statePath, JSON.stringify(state, null, 2))
console.log('rotate: 完成——今日主会话', newId)
