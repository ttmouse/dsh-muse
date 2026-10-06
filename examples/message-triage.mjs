#!/usr/bin/env node
/**
 * message-triage — 脚本侧双渠道分诊（launchd 承载，静默=零对话接触）。
 *
 * 流程：钉钉 @我 + 微信私聊未读 → 确定性 A 类线索检测 →
 *   有 A 类 → 经 session/prompt 注入主会话（唯一会接触对话的路径）
 *   无 A 类 → 静默退出（零对话轮次）
 * 夜间（23:00-08:00）自动跳过。
 *
 * A 类线索（确定性）: 问句/等你/有空/帮忙/拜托/别忘了/deadline/截止/记得/沟通
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { seenRecently, markSeen } from './lib/seen-set.mjs'

const HOME = process.env.HOME ?? homedir()
const projectDir = process.env.MUSE_PROJECT_DIR ?? '/Users/douba/Projects/dsh-muse'
const SESSION_ID = process.env.MUSE_SESSION_ID ?? ''
const URL = process.env.MUSE_URL ?? 'http://127.0.0.1:19387'
const hour = new Date().getHours()
if (hour < 8 || hour >= 23) process.exit(0)

const A_CUES = /[？?]|等你回复|截止|需要你确认|需要你决定|尽快/i
// 微信渠道额外要求：最近 24h 内 + 最后发送者非本人（未回复）
import { mkdirSync as _mkdir } from 'node:fs'
const followups = []

// ---- 钉钉 @我 ----
try {
  const out = execFileSync('dws', ['chat', '+at-me', '--days', '3', '--format', 'json'], { timeout: 60000, encoding: 'utf8' })
  const d = JSON.parse(out)
  const msgs = d.messages ?? d.data?.messages ?? []
  for (const m of msgs) {
    const text = String(m.text ?? m.content ?? '')
    if (A_CUES.test(text)) followups.push(`钉钉 @我（${m.sender ?? '?'}）: ${text.slice(0, 80)}`)
  }
} catch (e) { /* 渠道不可用静默跳过 */ }

// ---- 微信私聊未读（最近 30h 活跃、非群/系统号） ----
try {
  const READER = join(process.env.HOME ?? '', '.codex', 'skills', 'wechat-cli', 'scripts', 'reader.sh')
  const out = execFileSync(READER, ['sessions', '--pretty'], { timeout: 60000, encoding: 'utf8' })
  const items = JSON.parse(out)?.data?.sessions ?? []
  const nowS = Date.now() / 1000
  for (const s of items) {
    if (!s.last_timestamp || (nowS - Number(s.last_timestamp)) >= 30 * 3600) continue
    if (Number(s.unread_count ?? 0) === 0) continue
    const u = String(s.username)
    if (u.includes('chatroom') || u.includes('foldgroup') || u === 'weixin') continue
    // 公众号/服务号不是真人对话：gh_ 前缀、brand* 会话、gutter 等一律跳过
    if (/^gh_/.test(u) || /brandservice|gutter|official/i.test(u) || (s.display_name && /公众号|发布|日报|医典|税务|银行/i.test(String(s.display_name)))) continue
    if (s.last_msg_sender && String(s.last_msg_sender).includes('豆爸')) continue // 最后是本人发的=已回复
    const ageH = s.last_timestamp ? (nowS - Number(s.last_timestamp)) / 3600 : 999
    if (ageH > 24) continue
    const text = String(s.summary ?? '')
    if (A_CUES.test(text)) followups.push(`微信（${s.display_name ?? u}）: ${text.slice(0, 80)}`)
  }
} catch (e) { /* 微信不可用静默跳过 */ }

if (followups.length === 0) process.exit(0) // ← 静默：零对话接触

// ---- 去重：内容寻址持久化已见集合（容量 50）——同批次 24h 内不重复注入，交替批次也不漏 ----
const batchHash = createHash('sha256').update(followups.join('|')).digest('hex').slice(0, 16)
const statePath = join(projectDir, '.triage-state.json')
const SEEN_TTL = 24 * 3600 * 1000
if (seenRecently(statePath, batchHash, SEEN_TTL)) {
  console.log('triage: 同批次 24h 内已注入，跳过')
  process.exit(0)
}

// ---- 有 A 类 → 注入主会话 ----
const { callRpc } = await import(join(projectDir, 'examples', 'lib', 'dsh-client.mjs'))
const sessionId = process.env.MUSE_SESSION_ID ?? SESSION_ID
if (!sessionId) { console.error('triage: 无 MUSE_SESSION_ID'); process.exit(1) }
try {
  await callRpc(URL, 'session/prompt', {
    requestId: crypto.randomUUID?.() ?? String(Date.now()),
    sessionId, mode: 'queue',
    content: [{ type: 'text', text: `[muse-triage] ${followups.length} 项需要你关注：\n${followups.map(f => '• ' + f).join('\n')}` }],
  })
  markSeen(statePath, batchHash, SEEN_TTL)
  appendFileSync(join(projectDir, 'demo-journal.md'),
    `- [${new Date().toISOString().slice(0, 16).replace('T', ' ')} +08:00] 消息分诊（脚本侧）：A 类 ${followups.length} 项已注入\n`)
  console.log(`triage: 注入 ${followups.length} 项`)
} catch (e) { console.error(`triage inject failed: ${String(e).slice(0, 200)}`) }
