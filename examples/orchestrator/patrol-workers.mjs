#!/usr/bin/env node
/**
 * orchestrator patrol-workers — 批量巡检工作者会话。
 *
 * 对每个工作者会话：读会话页判断状态（已交付/推进中/排队未启动/找不到），
 * 可选 --nudge 对「排队未启动」的工作者注入一次催办（注意：宿主串行化时
 * 催办只是排队，主会话空闲后才会被执行）。
 *
 * 用法: node patrol-workers.mjs --workers <ids逗号分隔或workers.json> [--nudge] [--url ...]
 */
import { parseArgs } from 'node:util'
import { callRpc } from '../lib/dsh-client.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    workers: { type: 'string' },
    nudge: { type: 'boolean' },
    url: { type: 'string', default: 'http://127.0.0.1:19387' },
  },
  allowPositionals: true,
})
let ids = (args.workers ?? '').split(',').map(s => s.trim()).filter(Boolean)
if (ids.length === 0) {
  const wf = join(process.cwd(), 'workers.json')
  if (existsSync(wf)) ids = JSON.parse(readFileSync(wf, 'utf8'))
}
if (ids.length === 0) { console.error('无工作者 id（--workers 或 workers.json）'); process.exit(2) }

for (const sid of ids) {
  const short = sid.replace('session-', '').slice(-8)
  try {
    const page = await callRpc(args.url, 'session/page', { address: { kind: 'session', sessionId: sid }, throughSeq: 0, maxMessages: 50 })
    const records = page.records ?? []
    const userMsgs = records.filter(r => r.event?.type === 'user/message').length
    const agentMsgs = records.filter(r => r.event?.type === 'agent/message').length
    let state = '排队未启动（宿主串行化，主会话空闲后会执行）'
    if (agentMsgs > 0) state = `推进中/已完成（agent 回复 ${agentMsgs} 条）`
    if (userMsgs > 1) state += '；含催办'
    console.log(`${short}: ${state}`)
    if (args.nudge && agentMsgs === 0) {
      await callRpc(args.url, 'session/prompt', {
        requestId: crypto.randomUUID?.() ?? String(Date.now()),
        sessionId: sid, mode: 'queue',
        content: [{ type: 'text', text: '[主控催办] 按你的目标合同推进一步；若已完成，请确认交付物路径。' }],
      })
      console.log(`  → 已注入催办`)
    }
  } catch (error) {
    console.log(`${short}: 读取失败 — ${String(error).slice(0, 100)}`)
  }
}
