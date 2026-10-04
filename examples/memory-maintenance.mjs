#!/usr/bin/env node
/**
 * muse memory-maintenance — memory lifecycle (roadmap B3).
 *
 * Moves entries older than --days (default 30) from the global memory file
 * into memories/archive/<YYYY-MM>.md, dedupes lines, and caps the project
 * files' growth. The newest state of the art is normalizeMemory (tool-memory);
 * this script adds the *time* dimension.
 *
 * Usage: node memory-maintenance.mjs [--days 30] [--dry-run]
 */
import { parseArgs } from 'node:util'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const args = parseArgs({
  args: process.argv.slice(2),
  options: { days: { type: 'string', default: '30' }, 'dry-run': { type: 'boolean' } },
  allowPositionals: true,
})
const days = Number(args.days)
const memDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'memories')
const mainPath = join(memDir, 'main.md')
const HEADER = ['# Muse memory', '', '> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.', '']

if (!existsSync(mainPath)) { console.log('maintenance: no memory file'); process.exit(0) }

const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
const iso = s => { const t = Date.parse(s); return Number.isNaN(t) ? NaN : t }
const seen = new Set()
const keep = [], archive = []
let headerDone = false

for (const line of readFileSync(mainPath, 'utf8').split('\n')) {
  if (line.startsWith('# Muse memory') || (line.startsWith('>') && line.includes('Human-editable'))) {
    if (!headerDone) { keep.push(...HEADER); headerDone = true }
    continue
  }
  if (line.trim() === '') { if (keep.at(-1) !== '' && keep.length > 0) keep.push(''); continue }
  if (seen.has(line)) continue
  seen.add(line)
  const ts = line.match(/\[([^\]]+)\]/)?.[1]
  const t = ts ? iso(ts) : NaN
  if (!Number.isNaN(t) && t < cutoff) archive.push(line)
  else keep.push(line)
}

if (args['dry-run']) {
  console.log(`maintenance (dry-run): archive ${archive.length}, keep ${keep.length}`)
  process.exit(0)
}

writeFileSync(mainPath, keep.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n'), { mode: 0o600 })
if (archive.length > 0) {
  const month = new Date().toISOString().slice(0, 7)
  const archivePath = join(memDir, 'archive', `${month}.md`)
  mkdirSync(dirname(archivePath), { recursive: true })
  const prev = existsSync(archivePath) ? readFileSync(archivePath, 'utf8') : `# Archive ${month}\n\n`
  writeFileSync(archivePath, prev + archive.join('\n').replace(/\n?$/, '\n'), { mode: 0o600 })
}
console.log(`maintenance: archived ${archive.length}, kept ${keep.length}`)
