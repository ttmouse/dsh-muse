/**
 * stall-classify — 断线会话分类纯函数（供 stall-patrol.mjs 与回归测试共用）。
 *
 * 信号优先级：goal.phase（blocked→blocked-goal / active→stalled-goal）>
 * inbox 排队未消费（stalled-inbox）> 未完 todos（stalled-todos）。
 * 同 goalId 多会话 → 最新闲置者为 canonical，其余改判 duplicate-goal。
 * 投影里 goal 为双层嵌套 {goal:{id,phase,...}, roundsStarted}；兼容单层旧形状。
 */
const SKIP_TITLE = /已退役|已废弃|已归档/

export function classifySessions(all, { masterId = '', now = Date.now(), idleMinMin = 30, windowH = 24 } = {}) {
  const v = s => s.projections?.values ?? {}
  const candidates = []
  for (const s of all) {
    if (s.blank || s.running) continue
    if (!masterId || s.sessionId === masterId) continue
    if (SKIP_TITLE.test(v(s).title ?? '')) continue
    const idleMin = Math.round((now - s.updatedAt) / 6e4)
    if (idleMin < idleMinMin || idleMin > windowH * 60) continue
    const rawGoal = v(s).goal
    const g = rawGoal?.goal ?? rawGoal
    const openTodos = (v(s).todos ?? []).filter(t => t.status !== 'completed')
    const queued = ['next-turn', 'next-step'].some(k => (v(s).inbox?.[k] ?? []).length > 0)
    const kind = g?.phase
      ? (g.phase === 'blocked' ? 'blocked-goal' : g.phase === 'active' ? 'stalled-goal' : null)
      : (queued ? 'stalled-inbox' : openTodos.length ? 'stalled-todos' : null)
    if (!kind) continue
    candidates.push({
      sessionId: s.sessionId, kind, idleMin, cwd: s.cwd ?? '',
      title: (v(s).title ?? '(无标题)').slice(0, 40),
      goalId: g?.id ?? '', goalRev: g?.revision ?? 0,
      openTodos: openTodos.length,
    })
  }
  const byGoal = new Map()
  for (const c of candidates.filter(c => c.goalId)) {
    const prev = byGoal.get(c.goalId)
    if (!prev) { byGoal.set(c.goalId, c); c.canonical = true }
    else if (c.idleMin < prev.idleMin) {
      prev.canonical = false
      prev.kind = 'duplicate-goal'
      c.canonical = true
      byGoal.set(c.goalId, c) // 地图必须跟手换新，否则后续会话仍在跟已被贬为 duplicate 的旧项比较
    } else {
      c.canonical = false
      c.kind = 'duplicate-goal'
    }
  }
  return candidates
}

/**
 * 上报去重键与压制时长（纯函数，供 stall-patrol 与回归测试共用）。
 *
 * 2026-10-08 加：blocked-goal 原先与普通候选一样只有 6 小时压制，同一条「等人发话」的
 * 闲置会话每天被重复上报 4 次（线上实测 09:00 / 15:00 同一会话各一份），属卡片噪声。
 * 现在 blocked-goal 的键带上 goal revision：版本不变=状态没变、只打扰用户一次；
 * 用户一旦发话或 keeper 推进（rev 变化）立即重新上报。压制窗与 duplicate-goal 同为 7 天。
 */
export const REPORT_TTL_MS = { default: 6 * 3600e3, long: 7 * 24 * 3600e3 }

export function reportKey(c) {
  return c.kind === 'blocked-goal'
    ? `${c.sessionId}:${c.kind}:r${c.goalRev ?? 0}`
    : `${c.sessionId}:${c.kind}`
}

export function reportTtlMs(c) {
  return c.kind === 'blocked-goal' || c.kind === 'duplicate-goal' ? REPORT_TTL_MS.long : REPORT_TTL_MS.default
}
