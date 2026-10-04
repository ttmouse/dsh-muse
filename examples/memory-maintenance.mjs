#!/usr/bin/env node
/** Timer-friendly memory maintenance; --dry-run never writes. */
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readdirSync } from 'node:fs'
import { maintainMemory } from '../tool-memory/lib/storage.js'

const { values: args } = parseArgs({
  options: { days: { type: 'string', default: '30' }, 'dry-run': { type: 'boolean' } },
})
const days = Number(args.days)
if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be positive')
const directory = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'memories')
const files = [join(directory, 'main.md')]
const projects = join(directory, 'projects')
if (existsSync(projects)) files.push(...readdirSync(projects).filter(n => n.endsWith('.md')).map(n => join(projects, n)))
let archived = 0, kept = 0
for (const file of files) {
  const result = maintainMemory(file, join(directory, 'archive', new Date().toISOString().slice(0, 7) + '.md'), days, args['dry-run'])
  archived += result.archived
  kept += result.kept
}
console.log(`maintenance${args['dry-run'] ? ' (dry-run)' : ''}: archive ${archived}, keep ${kept}; preferences/persona retained`)
