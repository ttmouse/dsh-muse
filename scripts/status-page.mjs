/** 当前状态一页纸：目标池 + 演进账本 + 机制心跳 + 看板快照 → 自包含 HTML（artifacts/muse-status-page.html）。
 *  来源议题 8247c884（用户 10-07 问「这些怎么可视化让我确认」）。每日 20:35 节拍顺带刷新。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
const HOME = process.env.HOME ?? '/'
const R = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const pool = R(join(HOME, '.dsh/muse/goal-pool.json')) ?? { armed: {}, queued: [] }
const evolution = R(join(process.cwd(), 'docs/evolution/state.json'))
const master = R(join(HOME, '.dsh/muse/master-session.json'))
const restart = R(join(HOME, '.dsh/muse/restart-recover.json'))
const patrol = R(join(HOME, '.dsh/muse/stall-patrol.json'))

let launchd = []
try {
  launchd = execSync('launchctl list | grep dsh-muse', { shell: '/bin/bash', encoding: 'utf8' })
    .trim().split('\n').map(l => { const [pid, status, label] = l.split('\t'); return { label, ok: status === '0' } })
} catch {}
let board = []
try {
  const res = await fetch('http://127.0.0.1:47825/api/tasks?projectId=832047a8-2866-4646-b99f-45a1edf1fae1')
  const d = await res.json()
  board = (d.tasks ?? d ?? []).filter(t => !['done', 'canceled'].includes(t.status))
    .map(t => ({ status: t.status, title: t.title, id: t.id }))
} catch {}

const cands = evolution?.candidates ?? []
const badge = { accepted: '✅ 已验收', waiting: '⏳ 等条件', deferred: '⏸ 搁置', rejected: '❌ 否决' }
const boardBadge = { todo: '待认领', in_progress: '进行中', in_review: '待验收', blocked: '受阻' }
const ago = iso => { if (!iso) return '—'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? m + ' 分钟前' : Math.round(m / 60) + ' 小时前' }

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Muse 当前状态 · 一页纸</title><style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:20px;background:#141517;color:#e8e6e3;line-height:1.55}
h1{font-size:1.25rem}h2{font-size:1rem;margin-top:26px;color:#9ad1ff;border-bottom:1px solid #ffffff22;padding-bottom:4px}
.card{border:1px solid #ffffff22;border-radius:10px;padding:10px 14px;margin:8px 0;background:#1d1e21}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.num{font-size:1.5rem;font-weight:700}.muted{opacity:.62;font-size:.8rem}
.ok{color:#4cc38a}.warn{color:#e5b567}.bad{color:#e5484d}
table{width:100%;border-collapse:collapse;font-size:.86rem}td,th{padding:4px 8px;border-bottom:1px solid #ffffff14;text-align:left}
.tag{display:inline-block;border-radius:6px;padding:1px 8px;font-size:.78rem;background:#ffffff14;margin-right:6px}
ul{margin:6px 0;padding-left:20px}li{margin:3px 0}.small{font-size:.8rem;opacity:.62}
</style></head><body>
<h1>Muse 当前状态 · 一页纸</h1>
<p class="muted">生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（Asia/Shanghai）· 主控 ${esc((master?.masterSession ?? '').slice(0, 23))} · 登记日期 ${esc(master?.date ?? '—')}</p>

<h2>目标（你要我做的）</h2>
<div class="card"><span class="tag">armed</span><b>${esc((pool.armed?.goal ?? '').split('\\n')[0])}</b><div class="muted">${esc(pool.armed?.status ?? '')}</div></div>
${(pool.queued ?? []).map(q => `<div class="card"><span class="tag">queued</span>${esc((q.goal ?? '').split('\\n')[0])}<div class="muted">${esc(q['下一步'] ?? '')}</div></div>`).join('')}

<h2>演进账本（怎么算做到、做到哪了）</h2>
<table><tr><th>项</th><th>状态</th><th>说明</th></tr>
${cands.map(c => `<tr><td><b>${esc(c.id)}</b> ${esc((c.title ?? '').slice(0, 30))}</td><td>${badge[c.status] ?? esc(c.status)}</td><td class="muted">${esc((c.evidence ?? c.note ?? '').slice(0, 90))}</td></tr>`).join('')}
</table>

<h2>机制心跳（后台自动化）</h2>
<div class="grid">
<div class="card"><div class="num ${launchd.every(l => l.ok) ? 'ok' : 'bad'}">${launchd.filter(l => l.ok).length}/${launchd.length}</div><div class="muted">launchd 任务正常</div></div>
<div class="card"><div class="num">${restart ? ago(restart.at) : '—'}</div><div class="muted">上次重启恢复扫描${restart ? `（候选 ${restart.candidates}，上报 ${restart.reported}）` : ''}</div></div>
<div class="card"><div class="num">${patrol ? ago(patrol.at) : '—'}</div><div class="muted">上次断线巡查${patrol ? `（候选 ${patrol.candidates}，上报 ${patrol.reported}）` : ''}</div></div>
</div>
<ul class="small">${launchd.map(l => `<li>${l.ok ? '✓' : '✗'} ${esc(l.label)}</li>`).join('')}</ul>

<h2>看板（进行中 / 等你验收）</h2>
${board.length ? board.map(b => `<div class="card"><span class="tag">${boardBadge[b.status] ?? esc(b.status)}</span>${esc(b.title)}</div>`).join('') : '<div class="card muted">看板上没有未完结事项</div>'}

<p class="small">数据源：goal-pool.json · docs/evolution/state.json · launchctl · restart-recover/stall-patrol 报告 · taskboard API。由 scripts/status-page.mjs 生成，每日 20:35 总结节拍顺带刷新。</p>
</body></html>`

writeFileSync('artifacts/muse-status-page.html', html)
console.log(`status-page: 已生成 artifacts/muse-status-page.html（账本 ${cands.length} 项、launchd ${launchd.length}、看板未完结 ${board.length}）`)
