#!/usr/bin/env node
/**
 * wechat-deep-triage — 微信深度分诊（时间线通读，超越未读计数）。
 *
 * 流程：最近活跃私聊（含关键人优先）→ 逐个通读时间线（带时间戳）→
 * 分角色判定跟进项（家人不打扰 / 关键合作人后置即跟进 / 非关键需语义线索+等待≥48h）。
 * 非文字记录（VoIP/图片/XML）不参与「最后一条」判定。
 *
 * 依赖：rion-wechat-cli reader.sh（只读）；关键人注册表 ~/.dsh/muse/key-people.json。
 * 用法: node wechat-deep-triage.mjs [--top 5] [--hours 72] [--messages 6] [--project-dir .]
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const get = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt }
const top = Number(get('--top', 5))
const hours = Number(get('--hours', 72))
const msgs = Number(get('--messages', 6))
const projectDir = get('--project-dir', join(process.env.HOME ?? '', 'Projects', 'dsh-muse'))

const READER = process.env.WECHAT_READER
  ?? join(process.env.CODEX_HOME ?? join(process.env.HOME ?? '', '.codex'), 'skills', 'wechat-cli', 'scripts', 'reader.sh')
const reader = (sub, scriptArgs) =>
  JSON.parse(execFileSync(READER, [sub, ...scriptArgs, '--pretty'], { timeout: 60000, encoding: 'utf8' }))

// ---- 关键人注册表 ----
let keyPeople = []
try {
  const kpPath = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'muse', 'key-people.json')
  keyPeople = JSON.parse(readFileSync(kpPath, 'utf8')).people ?? []
} catch {}
const keyByWxid = new Map(keyPeople.map(p => [p.wxid, p]))

// ---- 1. 会话分拣：普通最近私聊 + 关键人（窗口不受 top 限制） ----
const sessionsData = reader('sessions', [])
const items = sessionsData?.data?.sessions ?? []
const nowS = Date.now() / 1000
const isExcluded = u => ['weixin', 'filehelper', 'brandservicesessionholder'].includes(String(u))
  || String(u).includes('chatroom') || String(u).includes('foldgroup')
const normal = items
  .filter(s => s.last_timestamp && (nowS - Number(s.last_timestamp)) < hours * 3600
    && !keyByWxid.has(String(s.username)) && !isExcluded(String(s.username)))
  .sort((a, b) => Number(b.sort_timestamp ?? 0) - Number(a.sort_timestamp ?? 0))
  .slice(0, top)
const keySessions = items
  .filter(s => keyByWxid.has(String(s.username)) && s.last_timestamp
    && (nowS - Number(s.last_timestamp)) < hours * 3600)

// ---- 2. 逐个通读时间线 ----
const FOLLOWUP_CUES = /[？?]|等你|等回复|什么时候|有空|帮忙|拜托|别忘了|deadline|截止|记得|沟通/i
const threads = []
const collect = (session, name) => {
  try {
    const tl = reader('timeline', ['--talker', String(session.username), '--limit', String(msgs)])
    const msgsTl = tl?.data?.messages ?? tl?.messages ?? []
    const lines = msgsTl.map(m => {
      const ts = Number(m.create_time ?? m.time ?? m.createTime ?? 0)
      return {
        me: Boolean(m.from_me ?? m.isMe ?? m.is_me),
        text: String(m.text ?? m.content ?? m.kind_name ?? '').slice(0, 160),
        ageH: ts ? (nowS - ts) / 3600 : null,
      }
    })
    threads.push({ name, user: String(session.username), lines })
  } catch (error) {
    console.error(`deep-triage: ${name} timeline 失败: ${String(error).slice(0, 100)}`)
  }
}
for (const s of normal) collect(s, s.display_name ?? s.username)
for (const p of keyPeople) {
  const s = keySessions.find(x => String(x.username) === p.wxid)
  if (s) collect(s, `[关键人] ${p.name}（${p.role}）`)
}

// ---- 3. 判定（只看文字内容行；分角色语义） ----
const followups = []
let closed = 0
for (const th of threads) {
  const isKey = th.name.startsWith('[关键人]')
  const isFamily = isKey && th.name.includes('家人')
  const content = th.lines.filter(l => l.text && !l.text.startsWith('<') && !l.text.startsWith('['))
  const lastContent = content.at(-1)
  if (!lastContent) continue
  const lastFromOther = !lastContent.me
  const waitH = lastFromOther && lastContent.ageH !== null ? lastContent.ageH : null
  const cue = lastFromOther && FOLLOWUP_CUES.test(lastContent.text)

  let followup = false, tag = ''
  if (isFamily) {
    followup = false
  } else if (cue && lastFromOther) {
    followup = true
  } else if (isKey && lastFromOther) {
    followup = true; tag = '（关键合作人后置）'
  } else if (!isKey && lastFromOther && waitH !== null && waitH >= 48) {
    followup = true; tag = `（已等 ${waitH.toFixed(0)}h）`
  }

  if (followup) {
    followups.push({ name: th.name, last: lastContent.text, waitingH: waitH?.toFixed(0) })
    console.log(`  [需跟进] ${th.name}: ${lastContent.text.slice(0, 60)} ${tag}`)
  } else {
    closed++
    const who = lastContent.me ? '我' : '对方'
    console.log(`  [已闭环] ${th.name}: 最后一条是${who}消息，无需行动`)
  }
}
console.log(`跟进项: ${followups.length} ｜ 已闭环: ${closed}`)

// ---- 4. 留痕 ----
appendFileSync(join(projectDir, 'demo-journal.md'),
  `- [${new Date().toISOString().slice(0, 16).replace('T', ' ')} +08:00] 微信深度分诊：${threads.length} 私聊通读（关键人 ${keySessions.length}），跟进项 ${followups.length}${followups.length > 0 ? '（' + followups.map(f => f.name).join('、') + '）' : ''}\n`)
