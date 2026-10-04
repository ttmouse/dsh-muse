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
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    session: { type: 'string' },
    url: { type: 'string', default: 'http://127.0.0.1:3080' },
    rules: { type: 'string' },
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

const message = hits.map(h => h.message).join('\n')
if (args['dry-run']) { console.log(`gate: would inject: ${message}`); process.exit(0) }

// ---- mint the signed browser-session cookie (same scheme as dsh-client-connection) ----
const b64u = b => Buffer.from(b).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const credText = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
const secretLine = credText.split('\n').findIndex(l => l.includes('client-connection/browser-session:'))
if (secretLine === -1) { console.error('gate: no browser-session credential record found'); process.exit(2) }
const secretB64 = credText.split('\n').slice(secretLine).find(l => l.trim().startsWith('secret:'))?.split('secret:')[1]?.trim()
if (!secretB64) { console.error('gate: credential record has no secret'); process.exit(2) }
const secret = Buffer.from(secretB64, 'base64')

const authority = new URL(args['url']).host
const cookieName = 'dsh-auth-' + b64u(Buffer.from(createHash('sha256').update(authority).digest()))
const now = Date.now()
const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 60 * 60 * 1000 }
const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'))
const sig = b64u(createHmac('sha256', secret).update(body).digest())
const cookie = `${cookieName}=v1.${body}.${sig}`

// ---- inject via session.prompt RPC ----
const res = await fetch(new URL('/api/session/prompt', args['url']), {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({
    type: 'client-request',
    rpcId: randomUUID(),
    method: 'session/prompt',
    payload: {
      args: {
        _request: {
          sessionId: args['session'],
          mode: 'queue',
          content: [{ type: 'text', text: `[muse-gate] ${message}` }],
        },
      },
    },
  }),
})
const text = await res.text()
if (!res.ok) { console.error(`gate: inject failed ${res.status}: ${text.slice(0, 300)}`); process.exit(1) }
for (const h of hits) { try { unlinkSync(h.consume) } catch {} }
console.log(`gate: injected (${hits.length} signal) → ${args['session']}`)
