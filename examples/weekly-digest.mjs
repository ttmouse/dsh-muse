#!/usr/bin/env node
/**
 * weekly-digest — 每周消息/工作摘要（周报式汇总）。
 *
 * 聚合最近 7 天：demo-journal.md 的分诊/总结/复盘留痕 + 关键人私聊活跃 +
 * 信号箱状态 → 产出周报 Markdown（写入 Evergreen 笔记，无笔记环境则打印）。
 * 用法: node weekly-digest.mjs [--note] [--project-dir .]
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const toNote = args.includes('--note')
const projectDir = join(process.env.HOME ?? '', 'Projects', 'dsh-muse')
const journal = readFileSync(join(projectDir, 'demo-journal.md'), 'utf8')
const since = Date.now() - 7 * 24 * 3600 * 1000

// ---- 1. 最近 7 天 journal 行 ----
const lines = journal.split('\n').filter(l => l.startsWith('- ['))
const week = []
for (const l of lines) {
  const m = l.match(/^- \[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  if (!m) continue
  const t = new Date(`${m[1]}T${m[2]}:00+08:00`).getTime()
  if (t >= since) week.push(l)
}
const triage = week.filter(l => l.includes('消息分诊'))
const followupLines = week.filter(l => /跟进项 [1-9]/.test(l))
const summaries = week.filter(l => l.includes('每日总结'))

// ---- 2. 关键人活跃（7 天内有消息的私聊） ----
let keyActivity = []
try {
  const READER = join(process.env.HOME ?? '', '.codex', 'skills', 'wechat-cli', 'scripts', 'reader.sh')
  const out = execFileSync(READER, ['sessions', '--pretty'], { timeout: 60000, encoding: 'utf8' })
  const items = JSON.parse(out)?.data?.sessions ?? []
  const nowS = Date.now() / 1000
  let keyPeople = []
  try {
    keyPeople = JSON.parse(readFileSync(join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'muse', 'key-people.json'), 'utf8')).people ?? []
  } catch {}
  for (const p of keyPeople) {
    const s = items.find(x => String(x.username) === p.wxid)
    if (s?.last_timestamp && (nowS - Number(s.last_timestamp)) < 7 * 24 * 3600) {
      keyActivity.push(`${p.name}（${p.role}）· 最近活跃 ${new Date(Number(s.last_timestamp) * 1000).toLocaleDateString('zh-CN')}`)
    }
  }
} catch {}

// ---- 3. 信号箱状态 ----
let sig = ''
try {
  sig = execFileSync('python3', ['-m', 'ec', 'signals', 'stats'], { timeout: 60000, encoding: 'utf8', cwd: join(process.env.HOME ?? '', 'Projects', 'echo') }).slice(0, 200)
} catch {}

// ---- 4. 周报 ----
const weekNo = Math.ceil(((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 3600 * 1000)))
const md = `# 每周摘要（第 ${weekNo} 周，截至 ${new Date().toLocaleDateString('zh-CN')}）

## 消息监控
- 分诊扫描：${triage.length} 次留痕
- 跟进项：${followupLines.length === 0 ? '0（全部闭环）' : followupLines.length + ' 项 → ' + followupLines.join('；').slice(0, 200)}
- 关键人动态：${keyActivity.length > 0 ? keyActivity.join('；') : '本周无关键人私聊活跃'}

## 工作总结
- 每日总结：${summaries.length} 篇已入笔记
- 本周 journal 留痕：${week.length} 条

## 经验沉淀
- 信号箱：${sig ? sig.split('\n')[0] : 'n/a'}
`

console.log(md)
if (toNote) {
  const tmp = '/tmp/weekly-digest.md'
  const fs = await import('node:fs')
  fs.writeFileSync(tmp, md)
  try {
    const r = execFileSync('python3', [join(process.env.HOME ?? '', '.agents', 'skills', 'note-cli', 'scripts', 'ev_add_md.py'), tmp, '--date', new Date().toISOString().slice(0, 10), '--key', `weekly-digest-${new Date().toISOString().slice(0, 10)}`], { timeout: 60000, encoding: 'utf8' })
    console.log('已写入笔记')
  } catch (e) { console.log('笔记写入失败（--date 路径 bug？改用 --under）:', String(e).slice(0, 100)) }
}
appendFileSync(join(projectDir, 'demo-journal.md'), `- [${new Date().toISOString().slice(0, 16).replace('T', ' ')} +08:00] 周报生成：分诊 ${triage.length} 次/跟进 ${followupLines.length}/关键人 ${keyActivity.length}${toNote ? '/已入笔记' : ''}\n`)
