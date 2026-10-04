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
import { existsSync, unlinkSync, readFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { callRpc, llmJson, logDecision as sharedLog } from '../lib/dsh-client.mjs'

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
const projectDir = process.env.MUSE_PROJECT_DIR ?? process.cwd()
const rules = args['rules'] ? JSON.parse(readFileSync(resolve(args['rules']), 'utf8')) : []
const signalPath = join(projectDir, 'MUSE-SIGNAL.md')

/** Collect (message, consumePath) pairs that passed the gate. */
const hits = []
for (const rule of rules) {
  if (rule.type === 'file-exists' && existsSync(rule.path)) hits.push({ message: rule.message ?? `Signal: ${rule.path}`, consume: rule.path })
}
if (existsSync(signalPath)) {
  const text = readFileSync(signalPath, 'utf8')
  const first = text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#')) ?? 'Signal'
  hits.push({ message: first, consume: signalPath })
}
if (hits.length === 0) process.exit(0) // ← the whole point: silence, zero trace

// ---- judge gate (P3): a cheap LLM decides whether this is worth interrupting ----
const message = hits.map(h => h.message).join('\n')
if (args.judge) {
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
