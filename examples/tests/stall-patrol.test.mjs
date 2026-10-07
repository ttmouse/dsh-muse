import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySessions } from '../lib/stall-classify.mjs'

const NOW = 1_800_000_000_000
const min = m => NOW - m * 60_000

// 会话工厂：默认闲置 60 分钟、未运行、无信号（不该入选）；override 覆盖任意字段
function sess(over = {}) {
  const { goalPhase, goalNested = true, openTodos = 0, queued = 0, idleMin = 60, title = '普通工作会话', override = {}, sessionId = 'session-' + Math.random().toString(16).slice(2, 10) } = over
  const goal = goalPhase
    ? goalNested
      ? { goal: { id: 'goal-x', revision: 1, phase: goalPhase }, roundsStarted: 1 }
      : { id: 'goal-x', revision: 1, phase: goalPhase }
    : undefined
  return {
    sessionId,
    updatedAt: NOW - idleMin * 60_000,
    running: false, blank: false, cwd: '/tmp',
    projections: { values: {
      title, goal,
      todos: openTodos ? Array.from({ length: openTodos }, (_, i) => ({ content: 't' + i, status: i === 0 ? 'pending' : 'completed' })) : null,
      inbox: queued ? { 'next-turn': [{ type: 'text' }] } : {},
    } },
    ...override,
  }
}

test('双层嵌套 goal 形状识别（2026-10-07 线上漏检回归）', () => {
  const out = classifySessions([sess({ goalPhase: 'blocked' })], { masterId: 'session-m', now: NOW })
  assert.equal(out.length, 1)
  assert.equal(out[0].kind, 'blocked-goal')
  assert.equal(out[0].goalId, 'goal-x')
})

test('单层 goal 旧形状兼容', () => {
  const out = classifySessions([sess({ goalPhase: 'active', goalNested: false })], { masterId: 'session-m', now: NOW })
  assert.equal(out[0].kind, 'stalled-goal')
})

test('正常会话零信号不入选；running/blank 排除', () => {
  const out = classifySessions([sess(), sess({ override: { running: true }, goalPhase: 'active' }), sess({ override: { blank: true }, goalPhase: 'active' })], { masterId: 'session-m', now: NOW })
  assert.equal(out.length, 0)
})

test('todos 与 inbox 信号分类', () => {
  const out = classifySessions([sess({ openTodos: 2 }), sess({ queued: 1 })], { masterId: 'session-m', now: NOW })
  assert.deepEqual(out.map(c => c.kind).sort(), ['stalled-inbox', 'stalled-todos'])
})

test('主控自身排除；已退役/已废弃标题排除', () => {
  const out = classifySessions([
    sess({ override: { sessionId: 'session-m' }, goalPhase: 'active' }),
    sess({ goalPhase: 'active', title: '【已退役·前主控】Muse 旧主控' }),
    sess({ goalPhase: 'active', title: '【已废弃】某会话' }),
  ], { masterId: 'session-m', now: NOW })
  assert.equal(out.length, 0)
})

test('闲置窗口边缘：30 分钟以下与 24h 以上不入选', () => {
  const out = classifySessions([sess({ idleMin: 29, goalPhase: 'active' }), sess({ idleMin: 24 * 60 + 1, goalPhase: 'active' })], { masterId: 'session-m', now: NOW })
  assert.equal(out.length, 0)
  const edge = classifySessions([sess({ idleMin: 30, goalPhase: 'active' }), sess({ idleMin: 24 * 60, goalPhase: 'active' })], { masterId: 'session-m', now: NOW })
  assert.equal(edge.length, 2)
})

test('同 goal 多会话去重：最新为 canonical，其余 duplicate-goal', () => {
  const out = classifySessions([
    sess({ sessionId: 'session-old', idleMin: 790, goalPhase: 'active' }),
    sess({ sessionId: 'session-new', idleMin: 100, goalPhase: 'active' }),
    sess({ sessionId: 'session-mid', idleMin: 400, goalPhase: 'active' }),
  ].map(s => ({ ...s, projections: { values: { ...s.projections.values, goal: { goal: { id: 'goal-same', revision: 1, phase: 'active' } } } } })), { masterId: 'session-m', now: NOW })
  assert.equal(out.length, 3)
  const canon = out.filter(c => c.canonical)
  const dups = out.filter(c => c.canonical === false)
  assert.equal(canon.length, 1)
  assert.equal(canon[0].sessionId, 'session-new')
  assert.equal(dups.length, 2)
  assert.ok(dups.every(c => c.kind === 'duplicate-goal'))
})

test('不同 goal 不互相同化', () => {
  const a = sess({ sessionId: 'session-a', goalPhase: 'active' })
  const b = sess({ sessionId: 'session-b', goalPhase: 'active' })
  a.projections.values.goal.goal.id = 'goal-a'
  b.projections.values.goal.goal.id = 'goal-b'
  const out = classifySessions([a, b], { masterId: 'session-m', now: NOW })
  assert.ok(out.every(c => c.kind === 'stalled-goal' && c.canonical === true))
})
