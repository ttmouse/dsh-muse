#!/usr/bin/env node
/**
 * orchestrator detached-runner — 批量派生 detached headless 工作者（真并行）并监工收口。
 *
 * 与 spawn-worker.mjs（会话内派生）的区别：detached 模式每个工作者运行在
 * 独立宿主进程（dsh --profile headless），不受主会话串行化限制——真并行。
 *
 * 用法:
 *   node detached-runner.mjs --tasks tasks.json [--timeout 600] [--dry-run]
 * tasks.json: [{ "id": "w1", "contract": "...", "deliverable": "workers/w1/out.md" }, ...]
 */
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    tasks: { type: 'string' },
    timeout: { type: 'string', default: '600' },
    'dry-run': { type: 'boolean' },
  },
  allowPositionals: true,
})
const tasksFile = args.tasks
if (!tasksFile) { console.error('缺少 --tasks <tasks.json>'); process.exit(2) }
const tasks = JSON.parse(readFileSync(tasksFile, 'utf8'))
const timeoutMs = Number(args.timeout) * 1000

console.log(`detached-runner: ${tasks.length} 个合同，超时 ${args.timeout}s`)

const children = []
const t0 = Date.now()
for (const task of tasks) {
  if (existsSync(task.deliverable)) { console.log(`  skip ${task.id}（交付物已存在）`); continue }
  const prompt = `${task.contract}\n工作目录约定：交付物写入 ${task.deliverable}，完成后在文件末尾写 DETACHED-HOST-COMPLETE。`
  const log = `/tmp/muse-worker-${task.id}.log`
  const child = spawn(process.env.DSH_BIN ?? 'dsh', ['--profile', 'headless', prompt], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  child.unref()
  console.log(`  派生 ${task.id} → PID ${child.pid}（日志 ${log}）`)
  children.push({ id: task.id, pid: child.pid, deliverable: task.deliverable, log })
}

if (args['dry-run']) { console.log('dry-run: 不等待'); process.exit(0) }

// ---- 监工：轮询交付物，全部收口或超时退出 ----
const deadline = t0 + timeoutMs
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 15000))
  const pending = children.filter(c => !existsSync(c.deliverable))
  if (pending.length === 0) { console.log('runner: 全部交付 ✓'); break }
  console.log(`runner: ${Date.now() - t0}s — 待交付 ${pending.length}/${children.length}`)
  if (pending.length === children.length && Date.now() - t0 > timeoutMs / 2) {
    console.log('runner: 超过半程仍无任何交付——检查 dsh headless 是否可运行（dsh --profile headless "test"）')
  }
}
const final = children.filter(c => existsSync(c.deliverable)).length
console.log(`runner: 收口 ${final}/${children.length}`)
process.exit(final === children.length ? 0 : 1)
