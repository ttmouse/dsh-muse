/** 从巡逻统计 + ideas + 记忆状态生成系统健康仪表盘（自包含 HTML）。 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const dshHome = process.env.DSH_HOME ?? join(import.meta.dirname, '..', '..', '..', '..', '.dsh')
const read = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
let runs = []
try { runs = (JSON.parse(readFileSync(join(dshHome, 'muse', 'patrol-stats.json'), 'utf8')).runs ?? []).slice(0, 48) } catch {}
let ideas = []
try { ideas = (JSON.parse(readFileSync(join(dshHome, 'muse', 'ideas.json'), 'utf8')).ideas ?? []).slice(0, 10) } catch {}
const memory = read(join(dshHome, 'memories', 'main.md'))
const memLines = memory.split('\n').filter(l => l.startsWith('- ')).length
const headerCount = (memory.match(/# Muse memory/g) ?? []).length
const memOk = headerCount === 1
// 异常指标（A3 slice-3）：供仪表盘标记与主动提醒
const lastPatrolAgeHours = runs.length > 0 ? (Date.now() - Date.parse(runs[0].at)) / 3600e3 : null
const anomalies = []
if (!memOk) anomalies.push('记忆文件头部重复（自愈未生效，需人工检查）')
if (lastPatrolAgeHours !== null && lastPatrolAgeHours > 1) anomalies.push(`巡逻停滞：最后一次记录已是 ${lastPatrolAgeHours.toFixed(1)} 小时前`)
if (lastPatrolAgeHours === null) anomalies.push('尚无巡逻记录（launchd 未运行或统计刚启用）')
const last = runs[0]
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Muse 系统健康</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:16px}
h1{font-size:1.2rem}h2{font-size:1rem;margin-top:20px}.ok{color:#1a7f37}.warn{color:#b45309}
.card{border:1px solid #8884;border-radius:8px;padding:10px 14px;margin:8px 0}.num{font-size:1.6rem;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.muted{opacity:.6;font-size:.8rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}td{padding:3px 6px;border-bottom:1px solid #8883}</style></head>
<body>
<h1>Muse 系统健康</h1>
<div class="grid">
<div class="card"><div class="num">${runs.length}</div><div class="muted">最近巡逻（最多 48 次记录）</div></div>
<div class="card"><div class="num ${memOk ? 'ok' : 'warn'}">${memOk ? '健康' : '需修复'}</div><div class="muted">记忆文件（${memLines} 条）</div></div>
<div class="card"><div class="num">${ideas.length}</div><div class="muted">待回顾想法</div></div>
</div>
${anomalies.length > 0 ? `<div class="warn card"><strong>⚠ 异常（${anomalies.length}）</strong><div>${anomalies.map(a => `• ${a}`).join('<br>')}</div></div>` : '<div class="ok" style="margin:8px 0">✓ 无异常</div>'}
<h2>最近巡逻</h2>
<table><tr><th>时间(UTC)</th><th>信号数</th></tr>
${runs.map(r => `<tr><td>${r.at.slice(0, 19).replace('T', ' ')}</td><td>${r.hits}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">暂无</td></tr>'}
</table>
<h2>待回顾想法</h2>
${ideas.map(i => `<div class="card"><div class="muted">${i.at.slice(0, 16).replace('T', ' ')}</div>${i.text}</div>`).join('') || '<div class="muted">暂无</div>'}
<p class="muted">生成于 ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC · 由 gate 巡逻自动刷新</p>
</body></html>`
writeFileSync(new URL('./muse-dashboard.html', import.meta.url), html)
console.log(`built muse-dashboard.html (${runs.length} patrol runs, ${ideas.length} ideas, memory ${memOk ? 'ok' : 'needs fix'})`)
