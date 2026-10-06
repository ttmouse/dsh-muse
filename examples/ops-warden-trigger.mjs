#!/usr/bin/env node
/**
 * ops-warden-trigger — 定时把运维 prompt 注入 ops-warden 成员会话（非主控）。
 *
 * 高频运维（机制复盘/分诊复核）在成员自己的对话里执行；成员仅在发现 A 类
 * 事项时给 lead 发消息。主对话零轮次。
 *
 * launchd 传参: --kind retro|triage
 */
import { callRpc } from '../examples/lib/dsh-client.mjs'

const URL = process.env.MUSE_URL ?? 'http://127.0.0.1:19387'
const kindIdx = process.argv.indexOf('--kind')
const kind = kindIdx >= 0 ? (process.argv[kindIdx + 1] ?? '') : ''
const hour = new Date().getHours()

const PROMPTS = {
  retro: '【每日机制复盘】对今天的 dsh-muse 自动化机制做轻量复盘：读 examples/gate/gate-decisions.log、examples/reflect/reflect-decisions.log、demo-journal.md 今日部分、/Users/douba/.dsh/muse/patrol-stats.json、launchctl list | grep dsh-muse。四维快查：节奏/质量/停滞/异常（含 watchdog 触发）。有发现→追加到 docs/evolution/rounds/2026-10-06-agent-team-retro.md 的「日常复盘记录」节+小问题直接修+commit；无发现→demo-journal.md 记一行即可。仅在 A 类事项（安全/数据风险/机制失效）时才给 lead 发消息。',
  triage: '【分诊复核】读 demo-journal.md 最近 24h 分诊留痕 + /tmp/dsh-muse-triage.log，检查有无漏报的 A 类事项（需要用户行动/回复/时限）。发现真问题才给 lead 发消息，否则 demo-journal.md 记一行即可。',
}
const prompt = PROMPTS[kind] ?? (hour >= 20 ? PROMPTS.retro : PROMPTS.triage)

// ---- 路由：成员会话由 subagent routing 托管，外部只能经主控转交 ----
// 主控收到一行路由指令（~1 秒注意力），把任务 send_message 给成员——工作仍在成员会话。
const masterSession = process.env.MUSE_SESSION_ID ?? ''
if (!masterSession) { console.error('triage: 无 MUSE_SESSION_ID'); process.exit(1) }

await callRpc(URL, 'session/prompt', {
  requestId: crypto.randomUUID?.() ?? String(Date.now()),
  sessionId: masterSession, mode: 'queue',
  content: [{ type: 'text', text: `[ops-warden 触发] 请把以下任务 send_message 转交 ops-warden 执行（在成员会话完成，仅 A 类发现回报）：\n\n${prompt}` }],
})
console.log(`ops-warden-trigger: [${kind}] 路由指令 → 主控`)
