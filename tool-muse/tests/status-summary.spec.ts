import { describe, expect, it } from 'vitest'
import { summarizeMuseStatus } from '../src/client/status-summary.ts'

describe('summarizeMuseStatus', () => {
  it('shows goal phase, remaining rounds, blocking reason and routine budget at a glance', () => {
    expect(summarizeMuseStatus([
      '当前会话状态',
      '目标：整理发布清单',
      '阶段：waiting · 自治：armed',
      '进度：2/8 轮，剩余 6 轮',
      '阻塞原因：等待用户确认范围',
      '定时任务：每周回顾',
      '状态：等待',
      '次数：1/4，剩余 3 次',
      '下次运行：2026-10-06 01:00:00 UTC',
    ].join('\n'))).toBe('目标：整理发布清单　·　waiting · 自治：armed　·　剩余 6 轮　·　等待：等待用户确认范围　·　等待：每周回顾 · 剩余 3 次')
  })

  it('states explicitly when this session has no goal or routines', () => {
    expect(summarizeMuseStatus('当前会话状态\n目标：无\n定时任务：无'))
      .toBe('目标：无　·　定时任务：无')
  })

  it('does not leak arbitrary text into a fabricated status summary', () => {
    expect(summarizeMuseStatus('tool result unavailable')).toBe('Muse 状态结果')
  })
})
