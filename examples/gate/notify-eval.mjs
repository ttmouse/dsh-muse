/**
 * B02 baseline — paired evaluation of the notification judge.
 * Synthetic replay samples with expected labels; runs the same judge prompt as
 * gate --judge; reports precision/recall (provisional until human-labelled).
 * Zero real messages; all content synthetic.
 */
import { llmJson } from '../lib/dsh-client.mjs'

// expected: 'say' = 值得打断（时限/需行动/重要进展）；'skip' = 不值得
const SAMPLES = [
  { text: '云服务账单将于明天到期，需确认续费方式', expected: 'say', class: 'A 时限' },
  { text: '客户王总询问项目进度，希望今天得到回复', expected: 'say', class: 'A 需回复' },
  { text: 'GitHub 仓库有 3 个新 star', expected: 'skip', class: 'C 噪声' },
  { text: '每周技术Newsletter第42期已送达', expected: 'skip', class: 'B 资讯' },
  { text: '服务器磁盘使用率超过 90%，需要扩容决策', expected: 'say', class: 'A 需决策' },
  { text: '构建流水线第 108 次运行成功', expected: 'skip', class: 'C 常态' },
  { text: '您关注的开源项目发布了包含安全修复的新版本', expected: 'say', class: 'A 安全相关' },
  { text: '日历事件：例行周会 30 分钟后开始', expected: 'say', class: 'A 时限' },
  { text: '系统已完成例行备份', expected: 'skip', class: 'C 常态' },
  { text: '合作方提议将下周会议改到周四下午三点', expected: 'say', class: 'A 需决策' },
]

let said = 0, saidCorrect = 0, knownImportant = SAMPLES.filter(s => s.expected === 'say').length
let notifiedImportant = 0, duplicates = 0
const results = []

for (const s of SAMPLES) {
  const v = await llmJson(
    'You are the notification gate of a personal agent. Decide if this message is worth INTERRUPTING the user in their main conversation. Say yes only for: meaningful new progress on their goals, something needing their decision/action, or time-sensitive items. Reject: routine checks, test noise, marketing, anything they did not ask to be notified about. Reply ONLY strict JSON: {"worth_saying": boolean, "reason": "<=20 words"}',
    s.text,
  )
  const saidByJudge = v.worth_saying === true
  if (saidByJudge) said++
  if (s.expected === 'say') {
    if (saidByJudge) notifiedImportant++
  } else if (saidByJudge) duplicates++
  results.push({ class: s.class, expected: s.expected, judged: saidByJudge ? 'say' : 'skip', reason: v.reason, ok: (saidByJudge ? 'say' : 'skip') === s.expected })
}

const precision = said === 0 ? null : notifiedImportant / said
const recall = knownImportant === 0 ? null : notifiedImportant / knownImportant
console.log('== B02 通知判断基线（provisional，未经人工标注复核）==')
for (const r of results) console.log(` ${r.ok ? '✓' : '✗'} [${r.class}] 判:${r.judged} | ${r.reason}`)
console.log(`precision: ${precision === null ? 'N/A' : (precision * 100).toFixed(0) + '%'} (${notifiedImportant}/${said})`)
console.log(`recall:    ${recall === null ? 'N/A' : (recall * 100).toFixed(0) + '%'} (${notifiedImportant}/${knownImportant})`)
console.log(`重复通知: ${duplicates}（要求 0）`)
console.log(`误判明细: ${results.filter(r => !r.ok).map(r => `[${r.class}] ${r.reason}`).join(' ; ') || '无'}`)
