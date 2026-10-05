#!/usr/bin/env node
/**
 * muse — unified CLI entry for the dsh-muse toolkit.
 *
 * Subcommands dispatch to the existing scripts; nothing new is implemented
 * here. Run without args for the status board.
 */
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const gate = join(here, '..', 'gate')
const run = (cmd, opts = {}) => execFileSync(cmd, opts, { stdio: 'inherit', timeout: 120000 })
const runNode = (script, scriptArgs = [], opts = {}) => run(process.execPath, [script, ...scriptArgs], opts)

const HELP = `muse — dsh-muse 统一入口

用法: node muse.mjs <子命令>

  status                系统状态一览（launchd/决策/记忆/信号）
  patrol [args...]      跑一轮 gate 巡逻（透传 gate.mjs 参数）
  reflect [args...]     跑一轮反思（透传 reflect.mjs 参数）
  spawn "<合同>"        派生工作者会话（透传 spawn-worker.mjs）
  maintenance [days]    记忆生命周期维护（默认 30 天）
  ideas                 重建想法回顾页
  dashboard             重建系统健康仪表盘
`

const sub = process.argv[2]
const rest = process.argv.slice(3)

try {
  switch (sub) {
    case undefined:
    case 'status':
      run('bash', [join(here, 'muse-status.sh')])
      break
    case 'patrol':
      runNode(join(gate, 'gate.mjs'), rest)
      break
    case 'reflect':
      runNode(join(here, 'reflect', 'reflect.mjs'), rest)
      break
    case 'spawn':
      runNode(join(here, 'orchestrator', 'spawn-worker.mjs'), rest)
      break
    case 'maintenance': {
      const days = rest[0] ?? '30'
      runNode(join(here, 'memory-maintenance.mjs'), ['--days', days])
      break
    }
    case 'ideas':
      runNode(join(root, 'artifacts', 'ideas', 'build.mjs'))
      break
    case 'dashboard':
      runNode(join(here, 'muse-dashboard', 'build.mjs'))
      break
    case 'help':
    case '--help':
      console.log(HELP)
      break
    default:
      console.error(`未知子命令: ${sub}\n${HELP}`)
      process.exit(2)
  }
} catch (error) {
  console.error(`muse ${sub ?? ''}: ${String(error).slice(0, 300)}`)
  process.exit(1)
}
