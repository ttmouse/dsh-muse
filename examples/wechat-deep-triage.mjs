#!/usr/bin/env node
/**
 * wechat-deep-triage — 微信深度分诊（超越未读计数）。
 *
 * 取最近 N 个私聊 → 逐个通读时间线 → 识别「需要用户跟进」的事项
 * （对方等待回复/时限承诺/待办交接），输出跟进清单；无则静默。
 *
 * 依赖：rion-wechat-cli reader.sh（只读）；数据不出本机。
 * 用法: node wechat-deep-triage.mjs [--top 3] [--hours 72] [--messages 6]
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const get = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt }
const top = Number(get('--top', 3))
const hours = Number(get('--hours', 72))
const msgs = Number(get('--messages', 6))
const projectDir = get('--project-dir', process.cwd())

const READER = process.env.WECHAT_READER
  ?? join(process.env.CODEX_HOME ?? join(process.env.HOME ?? '', '.codex'), 'skills', 'wechat-cli', 'scripts', 'reader.sh')

const reader = (sub, scriptArgs) => JSON.parse(execFileSync(READER, [sub, ...scriptArgs, '--pretty'], { timeout: 60000, encoding: 'utf8' }))

// ---- 1. 最近私聊（按活跃排序，排除群/系统号/文件助手） ----
const sessionsData = reader('sessions', [])
const items = sessionsData?.data?.sessions ?? []
const nowS = Date.now() / 1000
const privateChats = items
  .filter(s => s.last_timestamp && (nowS - Number(s.last_timestamp)) < hours * 3600
    && !String(s.username).includes('chatroom')
    && !String(s.username).includes('foldgroup')
    && !['weixin', 'filehelper', 'brandservicesessionholder'].includes(String(s.username))
    && s.chat_type === 'private')
  .sort((a, b) => Number(b.sort_timestamp ?? 0) - Number(a.sort_timestamp ?? 0))
  .slice(0, top)

// ---- 2. 逐个通读时间线，收集对话摘要 ----
const threads = []
for (const s of privateChats) {
  try {
    const tl = reader('timeline', ['--talker', String(s.username), '--limit', String(msgs)])
    const msgsTl = tl?.data?.messages ?? tl?.messages ?? []
    const lines = msgsTl.map(m => ({
      me: Boolean(m.isMe ?? m.is_me),
      text: String(m.text ?? m.content ?? m.type ?? '').slice(0, 160),
    }))
    threads.push({ name: s.display_name ?? s.username, user: s.username, lines })
  } catch (error) {
    console.error(`deep-triage: ${s.username} timeline 失败: ${String(error).slice(0, 100)}`)
  }
}

// ---- 3. 跟进启发（确定性，不进 LLM）：对方最后一条是否含问句/等待/时限信号 ----
const FOLLOWUP_CUES = /[？?]|等你|等回复|什么时候|帮忙|拜托|别忘了|deadline|截止|记得/i
const followups = []
console.log(`== 微信深度分诊（最近 ${threads.length} 个私聊 × ${msgs} 条）==`)
for (const th of threads) {
  const last = th.lines.at(-1)
  const lastIsMine = last?.me === true
  const cue = last && !last.me && FOLLOWUP_CUES.test(last.text)
  if (cue) {
    followups.push({ name: th.name, last: last.text })
    console.log(`  [需跟进] ${th.name}: ${last.text}`)
  } else {
    console.log(`  [已闭环] ${th.name}: 最后一条是我方消息或无需行动`)
  }
}
console.log(`跟进项: ${followups.length}`)

// ---- 4. 留痕 ----
appendFileSync(join(projectDir, 'demo-journal.md'),
  `- [${new Date().toISOString().slice(0, 16).replace('T', ' ')} +08:00] 微信深度分诊：${threads.length} 私聊通读，跟进项 ${followups.length}${followups.length > 0 ? '（' + followups.map(f => f.name).join('、') + '）' : ''}\n`)
