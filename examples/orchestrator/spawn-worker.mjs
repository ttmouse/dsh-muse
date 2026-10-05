/**
 * 主控编排：派生一个工作者会话并下发目标合同。
 * 用法: node spawn-worker.mjs --contract <一句话目标> [--cwd <工作目录>] [--url http://127.0.0.1:19387]
 * 输出: worker session id（主控后续用它 page/prompt 巡检推进）。
 */
import { parseArgs } from 'node:util'
import { callRpc } from '../lib/dsh-client.mjs'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    contract: { type: 'string' },
    cwd: { type: 'string' },
    url: { type: 'string', default: 'http://127.0.0.1:19387' },
  },
  allowPositionals: true,
})
const contract = args.contract ?? args.positionals?.join(' ')
if (!contract) { console.error('缺少目标合同（--contract 或位置参数）'); process.exit(2) }
const cwd = args.cwd ?? process.cwd()

const created = await callRpc(args.url, 'session/create', {})
const sessionId = created.sessionId ?? created.id
if (!sessionId) { console.error(`session/create 未返回 sessionId: ${JSON.stringify(created).slice(0, 200)}`); process.exit(1) }

await callRpc(args.url, 'session/prompt', {
  requestId: crypto.randomUUID?.() ?? String(Date.now()),
  sessionId,
  mode: 'queue',
  content: [{ type: 'text', text: `[工作者合同] 你是主控编排下的工作者会话。目标合同：${contract}\n工作目录：${cwd}\n规则：独立完成、可验证产出、结果写入 ${cwd}/workers/${sessionId.slice(-8)}/report.md；不向用户提问；完成后明确写「合同完成」。` }],
})
console.log(JSON.stringify({ worker: sessionId, contract, cwd }, null, 1))
