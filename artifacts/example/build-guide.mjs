/** 注入数据 → 自包含学习指南（进度存 localStorage）。 */
import { readFileSync, writeFileSync } from 'node:fs'
const data = readFileSync(new URL('./learning-guide-data.json', import.meta.url), 'utf8')
const shell = readFileSync(new URL('./learning-guide-template.html', import.meta.url), 'utf8')
writeFileSync(new URL('./learning-guide.html', import.meta.url), shell.replaceAll('__DATA__', data))
console.log('built learning-guide.html')
