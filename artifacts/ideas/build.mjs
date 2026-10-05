/** 从 ~/.dsh/muse/ideas.json 生成自包含想法回顾页。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const dshHome = process.env.DSH_HOME ?? join(import.meta.dirname, '..', '..', '..', '..')
const src = join(dshHome, 'muse', 'ideas.json')
const ideas = existsSync(src) ? JSON.parse(readFileSync(src, 'utf8')).ideas : []
const rows = ideas.length > 0
  ? ideas.map(i => `<div class="idea"><div class="meta">${i.at.slice(0, 16).replace('T', ' ')}</div><div class="text">${i.text.replaceAll('<', '&lt;')}</div></div>`).join('\n')
  : '<div class="empty">还没有值得提出的想法——它们会在反思循环发现时出现在这里。</div>'
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Muse 想法回顾</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:16px}
h1{font-size:1.2rem}.idea{border:1px solid #8884;border-radius:8px;padding:10px 12px;margin:10px 0}
.meta{font-size:.75rem;opacity:.6}.text{margin-top:4px}.empty{opacity:.6;padding:24px 0}</style></head>
<body><h1>Muse 想法回顾（${ideas.length}）</h1>${rows}</body></html>`
writeFileSync(new URL('./ideas.html', import.meta.url), html)
console.log(`built ideas.html (${ideas.length} ideas)`)
