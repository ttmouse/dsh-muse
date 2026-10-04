/** 把 data.json 注入壳模板 → 自包含 dashboard.html（数据变更后重跑即更新）。 */
import { readFileSync, writeFileSync } from 'node:fs'
const data = readFileSync(new URL('./expenses.json', import.meta.url), 'utf8')
const shell = readFileSync(new URL('./dashboard-template.html', import.meta.url), 'utf8')
writeFileSync(new URL('./expense-dashboard.html', import.meta.url), shell.replaceAll('__DATA__', data))
console.log('built expense-dashboard.html')
