#!/usr/bin/env node
/**
 * dsh-muse gate — out-of-conversation proactive gate (ingress v0).
 *
 * Runs on a fast timer (launchd/cron, every minute). Deterministic checks run
 * OUTSIDE any DSH session: when nothing passes, the main conversation never
 * hears about it — no wake, no card, no trace. Only a passing signal is
 * injected into the target session via the DSH webserver `session.prompt` RPC.
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
import { existsSync, unlinkSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { callRpc, llmJson, logDecision as sharedLog } from '../lib/dsh-client.mjs'
import { pollImap } from './sources/imap.mjs'
import { pollJxaCalendar } from './sources/jxa-calendar.mjs'

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
const scriptRoot = new URL('../../', import.meta.url).pathname  // examples/gate → repo root
const projectDir = process.env.MUSE_PROJECT_DIR ?? scriptRoot
const rules = args['rules'] ? JSON.parse(readFileSync(resolve(args['rules']), 'utf8')) : []
const signalPath = join(projectDir, 'MUSE-SIGNAL.md')

/** Collect (message, consumePath?) pairs that passed the gate. */
const hits = []
for (const rule of rules) {
  if (rule.type === 'file-exists' && existsSync(rule.path)) hits.push({ message: rule.message ?? `Signal: ${rule.path}`, consume: rule.path })
}
// ---- P5: deterministic sensitive-content filter (pre-check layer; never reaches the agent) ----
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
        logDecision('jxa-calendar: 需要「日历」权限——系统设置 → 隐私与安全性 → 日历，允许运行本闸门的程序访问')
      } else console.error(`gate: jxa-calendar failed: ${String(error).slice(0, 160)}`)
    }
  }
  if (rule.type === 'imap') {
    try {
      const password = rule.passwordRef ? readCredRef(rule.passwordRef) : rule.password
      if (!password) { logDecision(`imap skipped: no password for ${rule.user}`); continue }
      for (const m of await pollImap({ ...rule, password })) {
        const text = `${m.subject}（来自 ${m.from}）`
        if (isSensitive(text)) { logDecision(`sensitive dropped: ${text.slice(0, 60)}`); continue }
        hits.push({ message: text, consume: undefined })
      }
      if (rule.markSeen) { /* seen flags already set by pollImap */ }
    } catch (error) { console.error(`gate: imap failed: ${String(error).slice(0, 160)}`) }
  }
  if (rule.type === 'http-poll') {
    try {
      for (const hit of await pollHttp(rule)) {
        if (hit.sensitive) { logDecision(`sensitive dropped (never reaches the agent): ${hit.message.slice(0, 60)}`); continue }
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
// ---- memory self-heal: collapse duplicate headers/entries written by pre-fix runtimes ----
function normalizeMemory(text) {
  const seen = new Set()
  const body = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('# Muse memory') || (line.startsWith('>') && line.includes('Human-editable'))) continue
    if (line === '' && (body.at(-1) === '' || body.length === 0)) continue
    if (line !== '' && line !== '…(older memories trimmed)') {
      if (seen.has(line)) continue
      seen.add(line)
    }
    body.push(line)
  }
  while (body.at(-1) === '') body.pop()
  return ['# Muse memory', '', '> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.', '', ...body, ''].join('\n')
}

try {
  const memPath = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'memories', 'main.md')
  if (existsSync(memPath)) {
    const raw = readFileSync(memPath, 'utf8')
    const fixed = normalizeMemory(raw)
    if (fixed !== raw) writeFileSync(memPath, fixed, { mode: 0o600 })
  }
} catch {}

if (hits.length === 0) process.exit(0) // ← the whole point: silence, zero trace

// ---- judge gate (P3): a cheap LLM decides whether this is worth interrupting ----
const message = hits.map(h => h.message).join('\n')
if (args.judge) {
  if (!message.trim()) { logDecision('skip: empty candidate message'); process.exit(0) }
  const verdict = await judgeWorthy(message)
  logDecision(`judge: ${verdict.worth_saying ? 'SAY' : 'SKIP'} — ${verdict.reason}`)
  if (!verdict.worth_saying) {
    logDecision(`candidates: ${message.replaceAll('\n', ' | ')}`)
    process.exit(0) // judged not worth it → silence, zero trace
  }
}

if (args['dry-run']) { console.log(`gate: would inject: ${message}`); process.exit(0) }

async function judgeWorthy(message) {
  const verdict = await llmJson(
    'You are the notification gate of a personal agent. Decide if this message is worth INTERRUPTING the user in their main conversation. Say yes only for: meaningful new progress on their goals, something needing their decision/action, or time-sensitive items. Reject: routine checks, test noise, anything they did not ask to be notified about.',
    message,
    args['judge-model'],
  )
  return { worth_saying: Boolean(verdict.worth_saying), reason: String(verdict.reason ?? '') }
}

function logDecision(line) { sharedLog(projectDir, 'gate-decisions.log', line) }

// ---- inject via session.prompt RPC ----
try {
  await callRpc(args['url'], 'session/prompt', {
    requestId: randomUUID(),
    sessionId: args['session'],
    mode: 'queue',
    content: [{ type: 'text', text: `[muse-gate] ${message}` }],
  })
} catch (error) {
  console.error(`gate: inject failed: ${String(error).slice(0, 300)}`)
  process.exit(1)
}
for (const h of hits) { try { unlinkSync(h.consume) } catch {} }
console.log(`gate: injected (${hits.length} signal) → ${args['session']}`)
