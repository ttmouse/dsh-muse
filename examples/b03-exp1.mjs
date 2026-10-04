/**
 * B03 实验 1：记忆纠正语义。
 * 同一主题先写错再纠正，验证：纠正条目与错误条目是否共存（记忆污染）？
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as _join } from 'node:path'
process.env.DSH_HOME = mkdtempSync(_join(tmpdir(), 'b03-exp1-'))
const { appendMemory, MEMORY_HEADER } = await import('../../tool-memory/lib/storage.js')
const { readFileSync } = await import('node:fs')
const { join } = await import('node:path')

const path = join(process.env.DSH_HOME, 'memories', 'main.md')
appendMemory(path, '用户的项目部署在 AWS', 'fact')
appendMemory(path, '用户的项目已迁移到自托管服务器，不再使用 AWS', 'fact')

const text = readFileSync(path, 'utf8')
const aws = (text.match(/AWS/g) ?? []).length
console.log('== 实验 1 结果 ==')
console.log(`AWS 出现次数: ${aws}（>1 = 错误记忆与纠正共存 → 注入时 agent 会同时看到两个矛盾事实）`)
console.log(text.split('\n').filter(l => l.startsWith('- ')).join('\n'))
console.log('\n== 结论 ==')
console.log(aws > 1
  ? '证实：当前 appendMemory 只按全句去重，纠正条目与过时条目共存，构成记忆污染（B03 的真实工作项）'
  : '纠正语义已存在（无需修复）')
