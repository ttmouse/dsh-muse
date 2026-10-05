/**
 * Prepare a scoped worker contract for a supported, explicitly authorized host.
 * This script deliberately does not create DSH sessions or send session/prompt:
 * that RPC can make an automated message look like direct human input.
 */
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    contract: { type: 'string' },
    cwd: { type: 'string' },
  },
  allowPositionals: true,
})
const contract = args.contract ?? args.positionals?.join(' ')
if (!contract) { console.error('缺少目标合同（--contract 或位置参数）'); process.exit(2) }
const cwd = args.cwd ?? process.cwd()

const reportPath = `${cwd.replace(/\/$/, '')}/workers/<assigned-id>/report.md`
console.log(JSON.stringify({
  prepared: true,
  dispatched: false,
  reason: 'No supported host-attested worker dispatch is configured. Do not use session/prompt to simulate human input.',
  contract: [
    `Task: ${contract}`,
    `Owned output: ${reportPath}`,
    'Authority: named local output only; no autonomy or routine/goal changes, external communication, production changes, or sub-agents.',
    'Return: changed paths, evidence, commands/results, limitations, next step.',
  ].join('\n'),
}, null, 2))
