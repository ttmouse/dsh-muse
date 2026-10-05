#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./example.json', import.meta.url))
const plan = JSON.parse(readFileSync(process.argv[2] ?? fixture, 'utf8'))
const fail = message => { throw new Error(message) }

if (plan.schema_version !== 1 || plan.mode !== 'dry-run') fail('Expected a version 1 dry-run manifest')
if (!plan.authority?.human_direct_turn_required || !plan.authority?.autonomy_grant_required_for_routine_management
  || plan.authority?.worker_grants_authority !== false) fail('Authority boundary is missing or unsafe')
if (!Array.isArray(plan.workstreams) || plan.workstreams.length === 0 || plan.workstreams.length > 8) {
  fail('A session requires 1..8 workstreams in this example')
}
if (!Number.isFinite(Date.parse(plan.sample_now))) fail('sample_now must be an ISO date')

const ids = new Set()
for (const item of plan.workstreams) {
  if (!item.id || ids.has(item.id)) fail(`Missing or duplicate workstream id: ${item.id}`)
  ids.add(item.id)
  if (!item.title?.trim() || !item.deliverable?.trim() || !Array.isArray(item.acceptance) || item.acceptance.length === 0) {
    fail(`${item.id}: title, deliverable and acceptance criteria are required`)
  }
  if (!['ready', 'active', 'waiting', 'done'].includes(item.status)) fail(`${item.id}: invalid status`)
  if (!Number.isSafeInteger(item.interval_seconds) || item.interval_seconds < 300) fail(`${item.id}: interval must be >= 300 seconds`)
  if (!Number.isSafeInteger(item.max_runs) || item.max_runs < 1 || item.max_runs > 1000) fail(`${item.id}: max_runs must be 1..1000`)
  if (!Number.isSafeInteger(item.runs) || item.runs < 0 || item.runs > item.max_runs) fail(`${item.id}: runs outside budget`)
  if (!Number.isFinite(Date.parse(item.next_run_at))) fail(`${item.id}: next_run_at must be an ISO date`)
}

const now = Date.parse(plan.sample_now)
const due = plan.workstreams
  .filter(item => ['ready', 'active'].includes(item.status) && item.runs < item.max_runs && Date.parse(item.next_run_at) <= now)
  .sort((a, b) => Date.parse(a.next_run_at) - Date.parse(b.next_run_at))
const selected = due[0]

console.log(JSON.stringify({
  mode: 'dry-run',
  sample_now: plan.sample_now,
  admitted_units: selected ? 1 : 0,
  selected: selected ? {
    id: selected.id,
    title: selected.title,
    deliverable: selected.deliverable,
    remaining_runs_before_unit: selected.max_runs - selected.runs,
    acceptance: selected.acceptance,
  } : null,
  authority: 'No work executed. A real DSH human turn and current authorization are required at runtime.',
}, null, 2))
