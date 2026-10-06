#!/usr/bin/env node
/**
 * daily-summary-sources — 每日总结的数据源聚合器。
 *
 * 聚合今天在各项目的工作痕迹：git 提交（~/Projects/* 一级项目）、
 * journal 留痕、信号箱增量。输出 Markdown 片段供每日总结管线引用。
 * 用法: node daily-summary-sources.mjs [--date YYYY-MM-DD]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const di = args.indexOf('--date')
const date = di >= 0 ? args[di + 1] : new Date().toISOString().slice(0, 10)
const projectsRoot = join(process.env.HOME ?? '', 'Projects')
const out = []

// ---- 1. 各项目今日 git 提交 ----
const commits = []
try {
  for (const name of readdirSync(projectsRoot)) {
    const git = join(projectsRoot, name, '.git')
    if (!existsSync(git)) continue
    try {
      const r = spawnSync('git', ['-C', join(projectsRoot, name), 'log', '--since', `${date}T00:00:00`, '--until', `${date}T23:59:59`, '--format=%h %s'], { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const log = r.stdout ?? ''
      const lines = log.split('\n').filter(Boolean)
      if (lines.length > 0) commits.push({ project: name, lines })
    } catch {}
  }
} catch {}
if (commits.length > 0) {
  out.push('## 今日 git 提交')
  for (const c of commits) {
    out.push(`\n**${c.project}**（${c.lines.length} 提交）`)
    for (const l of c.lines.slice(0, 10)) out.push(`- ${l}`)
  }
}

// ---- 2. dsh-muse journal 今日留痕 ----
try {
  const journal = readFileSync(join(projectsRoot, 'dsh-muse', 'demo-journal.md'), 'utf8')
  const today = journal.split('\n').filter(l => l.startsWith('- [') && l.includes(date))
  if (today.length > 0) {
    out.push(`\n## dsh-muse 今日留痕（${today.length} 条）`)
    for (const l of today.slice(0, 15)) out.push(`- ${l.replace(/^- /, '').slice(0, 120)}`)
  }
} catch {}

// ---- 3. 输出（stdout + /tmp 供管线读取） ----
const md = out.join('\n')
console.log(md || `（${date} 无 git 提交与留痕）`)
writeFileSync('/tmp/daily-sources.md', md)
