#!/usr/bin/env node
/**
 * muse reflect — the reflection loop (Muse's "continuous thinking").
 *
 * Script-side self-reflection: gathers memory + recent session context, asks a
 * cheap LLM to produce three kinds of output, and applies each through its own
 * gate — Muse's rule that proactive ideas never execute themselves:
 *   ① memory_additions → appended to the human-editable memory file (deduped)
 *   ② idea             → judged, then injected into the main session as a proposal
 *   ③ plan_note        → logged to reflect-decisions.log
 *
 * Usage:
 *   node reflect.mjs --session <sessionId> [--url http://127.0.0.1:3080]
 *                    [--dry-run] [--history 12]
 * Schedule it (launchd/cron, hourly or daily). Silent when there is nothing
 * worth saying.
 */
import { parseArgs } from 'node:util'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { callRpc, injectPrompt, llmJson, logDecision } from '../lib/dsh-client.mjs'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    session: { type: 'string' },
    url: { type: 'string', default: 'http://127.0.0.1:3080' },
    history: { type: 'string', default: '12' },
    'dry-run': { type: 'boolean' },
  },
  allowPositionals: true,
})
if (!args['session']) { console.error('reflect: --session <sessionId> is required'); process.exit(2) }

const projectDir = process.env.MUSE_PROJECT_DIR ?? process.cwd()
const memoryPath = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'memories', 'main.md')

// ---- gather inputs ----
const memory = existsSync(memoryPath) ? readFileSync(memoryPath, 'utf8').slice(-4000) : '(no memory yet)'
let recent = '(history unavailable)'
try {
  const addr = { address: { kind: 'session', sessionId: args['session'] }, maxMessages: Number(args.history) }
  let page
  try { page = await callRpc(args['url'], 'session/page', { ...addr, throughSeq: Number.MAX_SAFE_INTEGER }) }
  catch (e) {
    const cursor = Number(String(e).match(/past cursor (\d+)/)?.[1] ?? 0)
    page = await callRpc(args['url'], 'session/page', { ...addr, throughSeq: Math.max(0, cursor - Number(args.history)) })
  }
  const lines = []
  for (const r of page.records ?? []) {
    const e = r.event ?? r
    if (e.type === 'user/message') {
      const text = (e.data?.content ?? []).map(c => c.text ?? '').join(' ')
      if (text && !text.startsWith('<system-reminder>') && !text.startsWith('Time sampled')) lines.push(`user: ${text.slice(0, 250)}`)
    } else if (e.type === 'agent/message' || e.type === 'assistant/message') {
      const text = (e.data?.content ?? []).map(c => c.text ?? '').join(' ')
      if (text) lines.push(`agent: ${text.slice(0, 250)}`)
    }
  }
  recent = lines.slice(-Number(args.history)).join('\n') || '(no conversation text yet)'
} catch (error) {
  logDecision(projectDir, 'reflect-decisions.log', `history unavailable: ${String(error).slice(0, 120)}`)
}
let sessionInfo = ''
try {
  const list = await callRpc(args['url'], 'session/list', {})
  const mine = list.items.find(s => s.sessionId === args['session'])
  if (mine) sessionInfo = `title=${mine.projections?.values?.title ?? '(none)'}; running=${mine.running}; cwd=${mine.cwd}`
} catch {}

// ---- reflect ----
const verdict = await llmJson(
  'You are the reflection engine of a personal AI agent (Muse-like). Given the user\'s memory file, '
  + 'recent conversation, and session state, reflect quietly. Produce strict JSON: '
  + '{"memory_additions": [{"content": "<one self-contained sentence>", "kind": "preference|fact|lesson"}], '
  + '"idea": {"worth_saying": boolean, "text": "<a proposal the user could ask the agent to do>"} , '
  + '"plan_note": "<one-line note about how ongoing work could adjust>"}. '
  + 'Rules: memory_additions only for NEW durable facts/preferences/lessons not already in the memory file '
  + '(empty list if nothing new). idea.worth_saying=true ONLY for a genuinely useful, specific proposal — '
  + 'ideas are PROPOSALS, never actions you would take yourself. Be conservative; empty is fine.',
  `MEMORY FILE:\n${memory}\n\nSESSION: ${sessionInfo}\n\nRECENT CONVERSATION:\n${recent}`,
)
logDecision(projectDir, 'reflect-decisions.log', `reflect: memory=${verdict.memory_additions?.length ?? 0} additions; idea=${verdict.idea?.worth_saying ? verdict.idea.text.slice(0, 80) : 'none'}; plan=${verdict.plan_note?.slice(0, 80) ?? 'none'}`)

// ---- ① memory additions: dedupe, append ----
const existing = existsSync(memoryPath) ? readFileSync(memoryPath, 'utf8') : ''
const additions = (verdict.memory_additions ?? []).filter(a => a?.content && !existing.includes(a.content))
if (additions.length > 0 && !args['dry-run']) {
  mkdirSync(join(memoryPath, '..'), { recursive: true })
  if (!existsSync(memoryPath)) writeFileSync(memoryPath, '# Muse memory\n\n', { mode: 0o600 })
  const stamp = new Date().toISOString()
  writeFileSync(memoryPath, existing + additions.map(a => `- [${stamp}] (${a.kind ?? 'fact'}) ${String(a.content).replaceAll('\n', ' ')}\n`).join(''), { flag: 'a' })
}

// ---- ② idea: only as a proposal, only if worth saying ----
if (verdict.idea?.worth_saying && verdict.idea.text) {
  const text = `[muse-idea] ${verdict.idea.text}（想法而已——要我做就说一声）`
  if (args['dry-run']) console.log(`reflect: would inject idea: ${text}`)
  else {
    await injectPrompt(args['url'], args['session'], text)
    console.log(`reflect: idea injected → ${args['session']}`)
  }
} else {
  console.log(`reflect: no idea worth saying (memory +${additions.length})`)
}
