/**
 * restart-recover — 「桌面端重启之前进行中的对话」识别纯函数（供 restart-recover.mjs 与回归测试共用）。
 *
 * 判据来源（2026-10-08 实测）：会话投影缓存
 *   ~/.dsh/storages/session_projcache/sessions/<sessionId>.json 的 turnBoundary 行
 *   { openTurnStartSeq, lastStepStartSeq, lastStepBoundary, lastTurn }
 * openTurnStartSeq != null ⇒ 该轮次尚未收口（轮次收口时会清回 null，已闭环会话实测为 null）。
 * 真实样本 session-e6fe5d11：转录最后两条是 step/start + user/message，没有 turn/end，
 * 用户 17:59:29 提问后进程即消失，投影里 openTurnStartSeq 至今非空——这就是「重启之前的
 * 进行中对话」留下的持久信号，无需读转录、无需外部监控即可在重启后回溯。
 *
 * 入选判据（缺一不可）：openTurnStartSeq 非空 + running=false + 最后活动早于本宿主纪元
 * + 时间窗内 + 非空白 + 非主控自身 + 标题不在 已退役/已废弃/已归档。
 * 「早于本宿主纪元」= 这一轮死在了当前这个宿主进程里，等价于「重启前的进行中」；
 * 因此同一函数既能用于重启当场（RunAtLoad），也能用于脚本漏跑后的补扫。
 */
const SKIP_TITLE = /已退役|已废弃|已归档/

/**
 * 从会话条目里挑出「重启前进行中」的会话。
 * @param entries - 会话条目数组，每项 { sessionId, updatedAt, running, blank, cwd, title, openTurnStartSeq, openStep }
 * @param options.hostStartedAt - 当前宿主进程启动时间（ms）；最后活动晚上于它的轮次属于本纪元，不算重启遗留
 * @param options.now - 当前时间（ms）
 * @param options.windowH - 回溯窗口（小时），超过则视为陈旧历史不再打扰
 * @param options.masterId - 主控会话 id（排除自身）
 * @param options.graceMin - 宽限（分钟）：最后活动距今不足该值时不判定为中断（收口写入有延迟）
 */
export function classifyInterrupted(entries, { hostStartedAt = 0, now = Date.now(), windowH = 72, masterId = '', graceMin = 2 } = {}) {
  const out = []
  for (const e of entries) {
    if (e.blank || e.running) continue
    if (e.openTurnStartSeq === null || e.openTurnStartSeq === undefined) continue
    if (!(e.updatedAt < hostStartedAt)) continue
    const idleMin = Math.round((now - e.updatedAt) / 6e4)
    if (idleMin < graceMin || idleMin > windowH * 60) continue
    if (!masterId || e.sessionId === masterId) continue
    if (SKIP_TITLE.test(e.title ?? '')) continue
    out.push({
      sessionId: e.sessionId,
      kind: 'interrupted-turn',
      idleMin,
      cwd: e.cwd ?? '',
      title: (e.title ?? '(无标题)').slice(0, 40),
      openTurnStartSeq: e.openTurnStartSeq,
      openStep: e.openStep === true,
    })
  }
  return out.sort((a, b) => a.idleMin - b.idleMin)
}

/**
 * 上报去重键。带 openTurnStartSeq：同一个未收口轮次只打扰一次；
 * 主控把会话推活后该轮收口，若之后又死在新轮次（新 seq）则重新上报。
 */
export function seenKeyOf(c) {
  return `${c.sessionId}:interrupted-turn:${c.openTurnStartSeq}`
}

export const REPORT_TTL_MS = { default: 6 * 3600e3, long: 7 * 24 * 3600e3 }

/** 未收口轮次默认按 7 天压制：它是「同一件没做完的事」，不该反复推给主控。 */
export function reportTtlMs() {
  return REPORT_TTL_MS.long
}

/**
 * 宿主纪元比对：判断当前宿主进程是否发生过重启。
 * pid 相同但启动时间不同也算重启（macOS 会回收 pid）。
 * 没有上次记录（首跑 / 状态文件被删）→ changed=false，reason=first-run，仍照常扫描。
 */
export function detectRestart(prev, current) {
  if (!prev?.pid || !current?.pid) return { changed: false, reason: 'no-identity' }
  if (prev.pid !== current.pid) return { changed: true, reason: 'pid-changed' }
  if (prev.startedAt !== current.startedAt) return { changed: true, reason: 'pid-reused-new-start' }
  return { changed: false, reason: 'same-epoch' }
}

/** 注入主控的简报文本：结论 + 名单 + 处置口径，不张贴会话内容。 */
export function buildBrief(candidates, { total = 0, scanned = 0, restart = { changed: false, reason: 'same-epoch' }, windowH = 72 } = {}) {
  const lines = candidates.map(c => `- ${c.sessionId}｜闲置 ${c.idleMin} 分钟｜${c.openStep ? '步骤执行中' : '轮次已开未收口'}｜${c.title}｜cwd ${c.cwd}`)
  const lead = restart.changed
    ? `检测到桌面客户端已重启（${restart.reason}）`
    : `桌面客户端本轮未重启（${restart.reason}），补扫本次宿主启动之前留下的`
  return [
    `【重启恢复·中断对话】${lead}，发现 ${candidates.length} 个「进行中、但从未收口」的对话（普查 ${total} 会话，含投影缓存 ${scanned} 个，回溯窗 ${windowH}h）：`,
    ...lines,
    '判定依据：会话投影 turnBoundary.openTurnStartSeq 非空（轮次已开始但从未写入 turn/end）且最后活动早于当前宿主进程启动时间——即这一轮死在重启里。',
    '处置口径：逐个判断是否仍要继续——仍然相关就用 session/prompt 注入「继续」推动续跑（同 stall-patrol 的推活口径）并 journal 记一行；超过 24 小时或话题已过期的，只向用户一句话点出、由用户决定，不要盲目唤醒。已按 openTurnStartSeq 去重 7 天，同一轮次不会重复上报。',
  ].join('\n')
}
