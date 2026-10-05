/**
 * B02 baseline — paired evaluation of the notification judge.
 * Synthetic replay samples with expected labels; runs the same judge prompt as
 * gate --judge; reports precision/recall (provisional until human-labelled).
 * Zero real messages; all content synthetic.
 */
import { llmJson } from '../lib/dsh-client.mjs'
import { NOTIFICATION_JUDGE_PROMPT } from './notification-judge-prompt.mjs'

// 语料库：notify-corpus.json（持久回归资产）。labeled 跑对错，unlabeled 只跑判定供人工复核。
import { readFileSync } from 'node:fs'
const corpus = JSON.parse(readFileSync(new URL('./notify-corpus.json', import.meta.url), 'utf8'))
const SAMPLES = corpus.samples
const expectedOf = s => s.expected

// 旧内联样本（历史保留，语料库未覆盖时使用）
const LEGACY = [
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
const SAMPLES_ALL = [
  ...SAMPLES.filter(s => s.expected !== null).map(s => ({ ...s })),
  ...LEGACY,
]

const results = []
let said = 0, saidCorrect = 0, knownImportant = 0, notifiedImportant = 0, duplicates = 0
const unlabeled = []

for (const s of SAMPLES_ALL) {
  if (s.expected === null) { unlabeled.push(s); continue }
  const v = await llmJson(
    NOTIFICATION_JUDGE_PROMPT,
    s.text,
  )
  const saidByJudge = v.worth_saying === true
  if (saidByJudge) said++
  if (s.expected === 'say') {
    if (saidByJudge) notifiedImportant++
  } else if (saidByJudge) duplicates++
  results.push({ class: s.class, expected: s.expected, judged: saidByJudge ? 'say' : 'skip', reason: v.reason, ok: (saidByJudge ? 'say' : 'skip') === s.expected })
}

said = results.filter(r => r.judged === 'say').length
saidCorrect = results.filter(r => r.judged === 'say' && r.expected === 'say').length
knownImportant = results.filter(r => r.expected === 'say').length
const precision = said === 0 ? null : notifiedImportant / said
const recall = knownImportant === 0 ? null : notifiedImportant / knownImportant
console.log('== B02 通知判断基线（provisional，未经人工标注复核）==')
for (const r of results) console.log(` ${r.ok ? '✓' : '✗'} [${r.class}] 判:${r.judged} | ${r.reason}`)
console.log(`precision: ${precision === null ? 'N/A' : (precision * 100).toFixed(0) + '%'} (${notifiedImportant}/${said})`)
console.log(`recall:    ${recall === null ? 'N/A' : (recall * 100).toFixed(0) + '%'} (${notifiedImportant}/${knownImportant})`)
console.log(`重复通知: ${duplicates}（要求 0）`)

// == unlabeled 语料样本（round2/round3 已入语料库；判定仅供人工复核） ==
console.log('\n== unlabeled 语料样本（判定仅供人工复核，不计对错）==')
for (const s of unlabeled) {
  const j = judged.find(x => x.class === s.class)
  console.log(` [${j?.judged ?? '?'}] [${s.class}] ${s.text.slice(0, 40)}`)
}

console.log(`误判明细: ${results.filter(r => !r.ok).map(r => `[${r.class}] ${r.reason}`).join(' ; ') || '无'}`)
