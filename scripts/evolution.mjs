#!/usr/bin/env node
// Repository workflow support only. Never schedules work or grants authority.
import { readFileSync, statSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))
const statuses = ['ready', 'active', 'waiting', 'accepted', 'rejected', 'deferred']
const text = value => typeof value === 'string' && value.trim().length > 0

export function localFile(path, base = root) {
  if (!text(path) || isAbsolute(path)) return false
  try {
    const file = realpathSync(resolve(base, path))
    const rel = relative(realpathSync(base), file)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && statSync(file).isFile()
  } catch { return false }
}

export function validateState(state, fileExists = localFile) {
  const errors = []
  const require = (condition, message) => { if (!condition) errors.push(message) }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['state must be an object']
  require(state.version === 1, 'version must be 1')
  require(/^\d{4}-\d{2}-\d{2}$/.test(state.updated ?? ''), 'updated must be YYYY-MM-DD')
  require(['S0', 'S1', 'S2', 'S3'].includes(state.stage), 'stage must be S0..S3')
  require(text(state.runtime_note), 'runtime_note must state the observed runtime boundary')
  if (!Array.isArray(state.candidates) || !Array.isArray(state.rounds)) return [...errors, 'candidates and rounds must be arrays']
  const candidates = new Map()
  const rounds = new Map()
  for (const item of state.candidates) {
    if (!item || typeof item !== 'object') { errors.push('invalid candidate'); continue }
    require(text(item.id) && !candidates.has(item.id), `duplicate or missing candidate id: ${item.id}`)
    candidates.set(item.id, item)
    for (const field of ['title', 'problem', 'hypothesis', 'scenario', 'next_action']) {
      require(text(item[field]), `${item.id}: missing ${field}`)
    }
    require(text(item.scenario) && item.scenario.split(',').every(id => /^E[1-6]$/.test(id)), `${item.id}: invalid scenario`)
    require(statuses.includes(item.status), `${item.id}: invalid status`)
    require(Array.isArray(item.evidence), `${item.id}: evidence must be round ids`)
    if (['accepted', 'rejected'].includes(item.status)) require(item.evidence?.length > 0, `${item.id}: terminal decision needs evidence`)
  }
  require(state.candidates.filter(item => item?.status === 'active').length <= 1, 'at most one active candidate')
  for (const round of state.rounds) {
    if (!round || typeof round !== 'object') { errors.push('invalid round'); continue }
    require(text(round.id) && !rounds.has(round.id), `duplicate or missing round id: ${round.id}`)
    rounds.set(round.id, round)
    require(candidates.has(round.candidate), `${round.id}: unknown candidate`)
    require(['accepted', 'rejected', 'inconclusive'].includes(round.decision), `${round.id}: invalid decision`)
    require(['engineering', 'runtime', 'user'].includes(round.level), `${round.id}: invalid evidence level`)
    require(text(round.summary), `${round.id}: missing summary`)
    require(Array.isArray(round.evidence) && round.evidence.length > 0, `${round.id}: evidence paths required`)
    for (const path of Array.isArray(round.evidence) ? round.evidence : []) {
      require(text(path) && path.startsWith('docs/evolution/rounds/') && fileExists(path), `${round.id}: missing or unsafe evidence file: ${path}`)
    }
  }
  for (const item of candidates.values()) {
    for (const id of Array.isArray(item.evidence) ? item.evidence : []) {
      require(rounds.get(id)?.candidate === item.id, `${item.id}: invalid round reference: ${id}`)
    }
    if (['accepted', 'rejected'].includes(item.status)) {
      const last = rounds.get(Array.isArray(item.evidence) ? item.evidence.at(-1) : null)
      require(last?.decision === item.status, `${item.id}: status must match final evidence decision`)
    }
  }
  require(state.next === null || ['ready', 'active', 'waiting'].includes(candidates.get(state.next)?.status), 'next must reference actionable/waiting candidate or null')
  require(state.next !== null || !state.candidates.some(item => ['ready', 'active', 'waiting'].includes(item?.status)), 'next cannot be null while unfinished candidates exist')
  return errors
}

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function renderReport(state) {
  const e = escapeHtml
  const next = state.candidates.find(item => item.id === state.next)
  const cards = state.candidates.map(item => `<article data-status="${e(item.status)}"><div class="meta">${e(item.id)} · ${e(item.scenario)} <span>${e(item.status)}</span></div><h3>${e(item.title)}</h3><p>${e(item.problem)}</p><p><b>待验证假设</b> ${e(item.hypothesis)}</p><p><b>下一步</b> ${e(item.next_action)}</p><small>轮次证据：${e(item.evidence.join(', ') || '尚无')}</small></article>`).join('\n')
  return `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH Muse · 体验演进</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f1;--panel:#fff;--ink:#202f2d;--muted:#566761;--line:#dce4de;--accent:#285b4a}
@media(prefers-color-scheme:dark){:root{--bg:#14201c;--panel:#1d2c26;--ink:#edf3ef;--muted:#bbc9c1;--line:#344a3f;--accent:#9bceb6}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,sans-serif}main{max-width:1140px;margin:auto;padding:44px 24px 64px}header{border-bottom:1px solid var(--line);padding-bottom:24px}.eyebrow,.meta,small{color:var(--muted)}h1{font-size:clamp(28px,5vw,44px);line-height:1.25;margin:12px 0}h2{font-size:24px;margin-top:36px}h3{font-size:20px;margin:12px 0}p{margin:10px 0}.focus{border-left:4px solid var(--accent);padding:16px 24px;margin:28px 0;background:var(--panel)}.flow{display:flex;flex-wrap:wrap;gap:8px}.flow span{border:1px solid var(--line);padding:8px 14px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}article{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px}article[hidden]{display:none}.meta span{float:right;color:var(--accent)}select{font:inherit;background:var(--panel);color:var(--ink);padding:8px;border:1px solid var(--line);border-radius:6px}label{display:block;margin:18px 0}li{margin:12px 0}footer{margin-top:32px;color:var(--muted)}
</style><main>
<header><div class="eyebrow">DSH MUSE / CONTINUOUS EVOLUTION · ${e(state.updated)} · ${e(state.stage)}</div><h1>让每一轮，减少一件需要人操心的事。</h1><p>成果、连续性、分寸、记忆、可控性。按证据推进，不以功能数衡量接近程度。</p><p><b>运行边界：</b>${e(state.runtime_note)}</p></header>
<section class="focus"><div class="eyebrow">下一轮 · ${e(state.next ?? '无')}</div><h2>${e(next?.title ?? '当前有限候选已收口')}</h2><p>${e(next?.next_action ?? '等待新的直接人类请求。')}</p></section>
<h2>改进循环</h2><div class="flow">${['观察摩擦','收集证据','提出假设','最小实验','场景验证','保留或否决','下一步'].map(x => `<span>${x}</span>`).join('')}</div>
<p>执行前检查真实授权和预算。单写者、单个 active 实验；连续无证据就退避，不能自主续期。</p>
<h2>候选与证据</h2><label>筛选状态 <select id="filter"><option value="all">全部</option>${statuses.map(x => `<option value="${x}">${x}</option>`).join('')}</select></label><div class="grid">${cards}</div>
<h2>已记录的轮次</h2><ul>${state.rounds.map(r => `<li><b>${e(r.id)} · ${e(r.decision)} · ${e(r.level)}</b><br>${e(r.summary)}<br><small>${e(r.evidence.join(' · '))}</small></li>`).join('')}</ul>
<footer>这是离线生成的账本快照，不代表 DSH 正在运行。真实体验与用户评价未完成时不得标为已验证。<br>从 docs/evolution/README.md 继续；更新后运行 pnpm evolution:report。无外部请求或依赖。</footer>
</main><script>document.getElementById('filter').addEventListener('change',event=>{document.querySelectorAll('[data-status]').forEach(card=>{card.hidden=event.target.value!=='all'&&card.dataset.status!==event.target.value})})</script></html>`
}

function main() {
  const command = process.argv[2] ?? 'status'
  if (!['status', 'check', 'report'].includes(command) || process.argv.length > 3) throw new Error('Usage: node scripts/evolution.mjs [status|check|report]')
  const state = JSON.parse(readFileSync(resolve(root, 'docs/evolution/state.json'), 'utf8'))
  const errors = validateState(state)
  if (errors.length) throw new Error(errors.join('\n'))
  if (command === 'check') { console.log(`Evolution state OK: ${state.candidates.length} candidates, ${state.rounds.length} rounds. Evidence content/runtime authority still require review.`); return }
  if (command === 'report') {
    const path = resolve(root, 'artifacts/muse-evolution.html')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, renderReport(state))
    console.log(`Generated ${path}`)
    return
  }
  console.log(`${state.stage} · ${state.updated}\n${state.runtime_note}`)
  for (const item of state.candidates) console.log(`${item.id === state.next ? '→' : ' '} ${item.id} [${item.status}] ${item.title}\n  ${item.next_action}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
