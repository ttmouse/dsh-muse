#!/usr/bin/env node
/**
 * muse habits-miner — cross-project behavior mining.
 *
 * Scans ~/Projects/* repos (git history + structural features) to surface the
 * user's recurring improvement habits, then writes a habits report into the
 * global memory dir for the reflection loop to consume. Local-only.
 *
 * Usage: node habits-miner.mjs [--projects-dir ~/Projects] [--depth 20]
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const get = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt }
const projectsDir = (get('--projects-dir', '') || join(homedir(), 'Projects')).replace(/^~/, homedir())
const depth = Number(get('--depth', 20))
const outDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'memories')

// ---- collect repos ----
const repos = readdirSync(projectsDir, { withFileTypes: true })
  .filter(e => e.isDirectory() && existsSync(join(projectsDir, e.name, '.git')))
  .map(e => join(projectsDir, e.name))

const report = { scannedAt: new Date().toISOString(), repos: [], patterns: [] }

// ---- structural habit signals (what the user tends to build into projects) ----
const STRUCTURE_SIGNALS = {
  'AGENTS.md 路由规则正本': p => existsSync(join(p, 'AGENTS.md')),
  'docs/ 文档体系': p => existsSync(join(p, 'docs')),
  '.gitignore 卫生管理': p => existsSync(join(p, '.gitignore')),
  'launchd/定时任务托管': p => existsSync(join(p, 'Library')) || JSON.stringify(safeRead(p, 'package.json')).includes('launchd'),
  '示例目录 examples/': p => existsSync(join(p, 'examples')),
}
function safeRead(p, f) { try { return readFileSync(join(p, f), 'utf8') } catch { return '' } }

for (const repo of repos) {
  const entry = { repo: basename(repo), commits: [], features: [] }
  try {
    const log = execSync(`git -C "${repo}" log --oneline -${depth}`, { timeout: 10000 }).toString()
    entry.commits = log.split('\n').filter(Boolean)
  } catch { entry.commits = ['(no commits)'] }
  for (const [label, test] of Object.entries(STRUCTURE_SIGNALS)) {
    try { if (test(repo)) entry.features.push(label) } catch {}
  }
  report.repos.push(entry)
}

// ---- aggregate habit patterns (frequency across repos) ----
const featureCount = {}
for (const r of report.repos) for (const f of r.features) featureCount[f] = (featureCount[f] ?? 0) + 1
report.patterns = Object.entries(featureCount)
  .map(([f, n]) => ({ habit: f, repos: n, ratio: `${n}/${report.repos.length}` }))
  .sort((a, b) => b.repos - a.repos)

// ---- write report (local, owner-only) ----
mkdirSync(outDir, { recursive: true })
const out = join(outDir, 'habits-report.json')
writeFileSync(out, JSON.stringify(report, null, 1), { mode: 0o600 })
console.log(`habits: scanned ${report.repos.length} repos → ${out}`)
console.log('top patterns:', report.patterns.slice(0, 5).map(p => `${p.habit}(${p.repos})`).join(', '))
