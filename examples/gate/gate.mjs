#!/usr/bin/env node
/**
 * dsh-muse gate — out-of-conversation proactive gate (ingress v0).
 *
 * Runs on a fast timer (launchd/cron, every minute). Deterministic checks run
 * OUTSIDE any DSH session: when nothing passes, the main conversation never
 * hears about it — no wake, no card, no trace. Only a passing signal is
 * staged in a durable local mailbox; the native plugin delivers a non-human message.
 *
 * Usage:
 *   node gate.mjs --session <sessionId> [--url http://127.0.0.1:3080]
 *                 [--rules ./gate-rules.json] [--dry-run]
 *
 * Rules file (JSON): array of { "type": "file-exists", "path": "...", "message": "..." }
 * plus built-in signal convention: a file named MUSE-SIGNAL.md whose first
 * non-heading line is the message. On inject, the signal file is consumed
 * (deleted) so it fires once.
 *
 * Auth: mints the same signed browser-session cookie `dsh web` issues, using
 * the local credential record (owner-only ~/.dsh/.credentials.yaml). Never
 * leaves the machine; requires the script to run as the same OS user.
 */
import { existsSync, unlinkSync, readFileSync, appendFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { injectPrompt, llmJson, logDecision as sharedLog } from '../lib/dsh-client.mjs'
import { fileURLToPath } from 'node:url'
import { checkOutbound } from '../lib/outbound-policy.mjs'
import { pollImap } from './sources/imap.mjs'
import { pollJxaCalendar } from './sources/jxa-calendar.mjs'
import { NOTIFICATION_JUDGE_PROMPT } from './notification-judge-prompt.mjs'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    session: { type: 'string' },
    url: { type: 'string', default: 'http://127.0.0.1:3080' },
    rules: { type: 'string' },
    judge: { type: 'boolean' },
    'judge-model': { type: 'string', default: 'deepseek-chat' },
    'dry-run': { type: 'boolean' },
  },
  allowPositionals: true,
})
if (!args['session']) { console.error('gate: --session <sessionId> is required'); process.exit(2) }

// ---- rules ----
// launchd runs with cwd=/ — derive the project root from this script's location instead
const scriptRoot = fileURLToPath(new URL('../../', import.meta.url))
const projectDir = process.env.MUSE_PROJECT_DIR ?? scriptRoot
const rules = args['rules'] ? JSON.parse(readFileSync(resolve(args['rules']), 'utf8')) : []
const signalPath = join(projectDir, 'MUSE-SIGNAL.md')

/** Collect (message, consumePath?) pairs that passed the gate. */
const hits = []
for (const rule of rules) {
  if (rule.type === 'file-exists' && existsSync(rule.path)) hits.push({ message: rule.message ?? `Signal: ${rule.path}`, consume: rule.path })
}
// ---- P5: deterministic sensitive-content filter (pre-check layer; never reaches the agent) ----
// F5: prompt-injection screening — untrusted signal content that attempts to
// manipulate the agent never reaches the judge LLM (deterministic pre-filter)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /忽略[^\n。]*(指令|规则|设定)/i,
  /disregard\s+(all\s+)?(previous|your)\s+(instructions|rules)/i,
  /you\s+are\s+now\s+(a|an|no longer)/i,
  /system\s+prompt(\s|$|:)/i,
  /(reveal|print|show)\s+(your|the)\s+(system\s+prompt|instructions|api\s*key)/i,
  /(导出|泄露|告诉我)\s*(你的)?\s*(系统提示|密钥|凭证)/i,
]
function isInjectionAttempt(text) { return INJECTION_PATTERNS.some(p => p.test(text)) }

const SENSITIVE_PATTERNS = [
  /验证码|verification code|one[- ]time code/i,
  /password reset|重置密码|reset your password/i,
  /sign[- ]in link|magic link|免密登录/i,
  /\b\d{4,8}\b(?=.*(?:code|码))/i,
]
function isSensitive(text) { return SENSITIVE_PATTERNS.some(p => p.test(text)) }

/** Read a named key from the local credentials file (never leaves the machine). */
function readCredRef(key) {
  try {
    const line = readFileSync(join(process.env.HOME ?? homedir(), '.dsh', '.credentials.yaml'), 'utf8')
      .split('\n').find(l => l.trim().startsWith(`${key}:`))
    return line?.split(':').slice(1).join(':').trim().replaceAll("'", '') ?? undefined
  } catch { return undefined }
}

// ---- P1: http-poll source — poll an external API, report only NEW items since last run ----
async function pollHttp(rule) {
  const res = await fetch(rule.url, { headers: rule.headers ?? {} })
  if (!res.ok) throw new Error(`http-poll ${res.status} for ${rule.url}`)
  const body = await res.json()
  const items = rule.select ? rule.select.split('.').reduce((o, k) => o?.[k], body) ?? [] : body
  const list = Array.isArray(items) ? items : [items]
  const stateDir = join(projectDir, '.gate-state')
  mkdirSync(stateDir, { recursive: true })
  const stateFile = join(stateDir, createHash('sha256').update(rule.url).digest('hex').slice(0, 16) + '.json')
  const seen = existsSync(stateFile) ? new Set(JSON.parse(readFileSync(stateFile, 'utf8'))) : new Set()
  const fresh = list.filter(item => {
    const id = typeof item === 'string' ? item : JSON.stringify(item)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  writeFileSync(stateFile, JSON.stringify([...seen].slice(-500)))
  return fresh.map(item => {
    const text = typeof item === 'string' ? item : JSON.stringify(item)
    return { message: (rule.messageTemplate ?? '$text').replaceAll('$text', text), sensitive: isSensitive(text) }
  })
}

for (const rule of rules) {
  if (rule.type === 'jxa-calendar') {
    try {
      for (const ev of pollJxaCalendar(rule)) {
        hits.push({ message: (rule.messageTemplate ?? '日程提醒：$summary（$startLabel，日历：$calendar）')
          .replaceAll('$summary', ev.summary).replaceAll('$startLabel', ev.startLabel).replaceAll('$calendar', ev.calendar) })
      }
    } catch (error) {
      if (error.code === 'CALENDAR_PERMISSION_REQUIRED') {
        const guide = rule.permissionGuide ?? 'jxa-calendar: 需要「日历」权限——系统设置 → 隐私与安全性 → 日历，允许运行本闸门的程序访问'
        logDecision(`permissionGuide: ${guide}`)
        console.error(`gate: ${guide}`)
      } else console.error(`gate: jxa-calendar failed: ${String(error).slice(0, 160)}`)
    }
  }
  if (rule.type === 'imap') {
    try {
      const password = rule.passwordRef ? readCredRef(rule.passwordRef) : rule.password
      if (!password) {
        const guide = rule.permissionGuide ?? `imap: 需要授权码——${rule.user} 的应用专用密码存入凭证文件（passwordRef: ${rule.passwordRef ?? '必填'}）`
        logDecision(`permissionGuide: ${guide}`)
        continue
      }
      for (const m of await pollImap({ ...rule, password })) {
        const text = `${m.subject}（来自 ${m.from}）`
        if (isSensitive(text)) { logDecision('sensitive item dropped'); continue }
        hits.push({ message: text, consume: undefined })
      }
      if (rule.markSeen) { /* seen flags already set by pollImap */ }
    } catch (error) { console.error(`gate: imap failed: ${String(error).slice(0, 160)}`) }
  }
  if (rule.type === 'http-poll') {
    try {
      for (const hit of await pollHttp(rule)) {
        if (hit.sensitive) { logDecision('sensitive item dropped before model context'); continue }
        hits.push({ message: hit.message })
      }
    } catch (error) { console.error(`gate: poll failed: ${String(error).slice(0, 160)}`) }
  }
}

if (existsSync(signalPath)) {
  const text = readFileSync(signalPath, 'utf8')
  const first = text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#')) ?? 'Signal'
  hits.push({ message: first, consume: signalPath })
}
// ---- watchdog: detect patrol gaps (self-monitoring, catches launchd loss) ----
try {
  const gapStatePath = join(scriptRoot, '.gate-state', 'last-patrol.json')
  mkdirSync(dirname(gapStatePath), { recursive: true })
  const nowMs = Date.now()
  let last = { at: nowMs }
  try { last = JSON.parse(readFileSync(gapStatePath, 'utf8')) } catch {}
  const gapMin = (nowMs - (last.at ?? nowMs)) / 60000
  if (gapMin > 30) {
    logDecision(`watchdog: 巡逻间隔 ${gapMin.toFixed(0)} 分钟（正常 2-30）——launchd 可能丢失/机器休眠，本轮自动恢复`)
  }
  writeFileSync(gapStatePath, JSON.stringify({ at: nowMs }))
} catch {}

// ---- A3 slice-3 + B04: patrol stats — feed the system health dashboard ----
try {
  const statsDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'muse')
  mkdirSync(statsDir, { recursive: true })
  const statsPath = join(statsDir, 'patrol-stats.json')
  let stats = { runs: [] }
  try { stats = JSON.parse(readFileSync(statsPath, 'utf8')) } catch {}
  if (!Array.isArray(stats.runs)) stats.runs = []
  stats.runs.unshift({ at: new Date().toISOString(), hits: hits.length, dryRun: args['dry-run'] === true })
  stats.runs = stats.runs.slice(0, 500)
  writeFileSync(statsPath, JSON.stringify(stats, null, 1), { mode: 0o600 })
} catch (error) { console.error(`patrol-stats skipped: ${String(error).slice(0, 120)}`) }

// ---- A3 slice-2: keep artifacts fresh — rebuild views when their data changed ----
try {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const ideasSrc = join(dshHome, 'muse', 'ideas.json')
  const ideasHtml = join(scriptRoot, 'artifacts', 'ideas', 'ideas.html')
  const ideasBuild = join(scriptRoot, 'artifacts', 'ideas', 'build.mjs')
  if (existsSync(ideasSrc) && (!existsSync(ideasHtml) || statSync(ideasSrc).mtimeMs > statSync(ideasHtml).mtimeMs)) {
    const { execFileSync } = await import('node:child_process')
    execFileSync(process.execPath, [ideasBuild], { timeout: 15000, env: { ...process.env, DSH_HOME: dshHome } })
    const dashBuild = join(scriptRoot, 'examples', 'muse-dashboard', 'build.mjs')
    const statsSrc = join(dshHome, 'muse', 'patrol-stats.json')
    const dashHtml = join(scriptRoot, 'examples', 'muse-dashboard', 'muse-dashboard.html')
    if (!existsSync(dashHtml) || (existsSync(statsSrc) && statSync(statsSrc).mtimeMs > statSync(dashHtml).mtimeMs)) {
      execFileSync(process.execPath, [dashBuild], { timeout: 15000, env: { ...process.env, DSH_HOME: dshHome } })
    }
  }
} catch (error) { console.error(`artifacts refresh skipped: ${String(error).slice(0, 120)}`) }

// Memory maintenance uses its own lock; the gate never rewrites memory files.
if (hits.length === 0) process.exit(0) // ← the whole point: silence, zero trace

// ---- judge gate (P3): a cheap LLM decides whether this is worth interrupting ----
// All inputs, including local timer signals, pass the same sensitive precheck.
const safeHits = hits.filter(hit => !isSensitive(hit.message))
if (safeHits.length === 0) process.exit(0)
const message = safeHits.map(h => h.message).join('\n')

// ---- F5 pre-LLM injection screening (untrusted content never reaches the judge) ----
if (isInjectionAttempt(message)) {
  logDecision('F5 blocked: prompt-injection pattern in signal — content withheld from LLM, skipped')
  for (const h of hits) { try { unlinkSync(h.consume) } catch {} }
  console.log('gate: blocked by F5 (prompt-injection pattern)')
  process.exit(0)
}

// ---- F3.1 pre-LLM credential gate (unconditional, before judge and before any log) ----
const exfil = checkOutbound({ channel: 'session-inject', payload: message })
if (exfil.decision === 'deny') {
  logDecision(`F3.1 blocked: credential material in outbound candidate — content withheld, never sent to LLM or logs`)
  console.log('gate: blocked by outbound policy F3.1 (credential material)')
  process.exit(0)
}

if (args.judge) {
  if (!message.trim()) { logDecision('skip: empty candidate message'); process.exit(0) }
  const verdict = await judgeWorthy(message)
  logDecision(`judge: ${verdict.worth_saying ? 'SAY' : 'SKIP'} — ${verdict.reason}`)
  if (!verdict.worth_saying) {
    logDecision(`candidates: ${message.replaceAll('\n', ' | ').replaceAll(/\b[A-Za-z0-9_-]{16,}\b/g, '<redacted>')}`)
    process.exit(0) // judged not worth it → silence, zero trace
  }
}

if (args['dry-run']) { console.log(`gate: would inject: ${message}`); process.exit(0) }

async function judgeWorthy(message) {
  const verdict = await llmJson(
    NOTIFICATION_JUDGE_PROMPT,
    message,
    args['judge-model'],
  )
  if (typeof verdict.worth_saying !== 'boolean') throw new Error('judge must return a boolean worth_saying')
  return { worth_saying: verdict.worth_saying, reason: String(verdict.reason ?? '') }
}

function logDecision(line) { sharedLog(projectDir, 'gate-decisions.log', line) }

// ---- F3 outbound check: credential material must never enter session context ----
const outbound = checkOutbound({ channel: 'session-inject', payload: message })
if (outbound.decision === 'deny') {
  logDecision(`F3 blocked: ${outbound.rule}`)
  for (const h of hits) { try { unlinkSync(h.consume) } catch {} }
  console.log('gate: blocked by outbound policy (credential material never enters context)')
  process.exit(0)
}

// ---- inject via session.prompt RPC ----
try {
  await injectPrompt(args['url'], args['session'], `[muse-gate] ${message}`)
} catch (error) {
  console.error(`gate: inject failed: ${String(error).slice(0, 300)}`)
  process.exit(1)
}
for (const h of safeHits) { try { if (h.consume) unlinkSync(h.consume) } catch {} }
console.log(`gate: queued (${safeHits.length} signal) → ${args['session']}`)
