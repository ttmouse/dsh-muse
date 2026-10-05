/** Short, glanceable text for the collapsed muse_status tool row. */
export function summarizeMuseStatus(text: string): string {
  if (!text.startsWith('当前会话状态')) return 'Muse 状态结果'

  const goal = text.match(/^目标：(.+)$/m)?.[1]
  const phase = text.match(/^阶段：(.+)$/m)?.[1]
  const rounds = text.match(/^进度：.*剩余 (\d+ 轮)$/m)?.[1]
  const blocked = text.match(/^阻塞原因：(.+)$/m)?.[1]
  const routines = [...text.matchAll(/^定时任务：(.+)\n状态：(.+)\n次数：.*剩余 (\d+ 次)$/gm)]

  const parts: string[] = []
  if (goal && goal !== '无') {
    parts.push(`目标：${goal}`)
    if (phase) parts.push(phase)
    if (rounds) parts.push(`剩余 ${rounds}`)
  } else {
    parts.push('目标：无')
  }
  if (blocked) parts.push(`等待：${blocked}`)

  if (routines.length === 0) {
    parts.push('定时任务：无')
  } else {
    for (const [, title, state, remaining] of routines) {
      parts.push(`${state}：${title} · 剩余 ${remaining}`)
    }
  }
  return parts.join('　·　')
}
