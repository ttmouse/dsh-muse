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
 * 上报去重键：会话 + 宿主纪元（议题 832047A82866-2 ②，2026-10-09 修订）。
 * 旧键带轮次序号，而主控推活会让会话开新轮次（序号变）→ 同一次重启被重复上报（04:16 实测）。
 * 新键按「哪一次重启」去重：同一会话在同一个宿主纪元内只打扰一次；下次重启（新纪元）再犯会重新上报。
 */
export function seenKeyOf(c, hostEpoch) {
  return `${c.sessionId}:interrupted-turn:${hostEpoch ?? c.openTurnStartSeq ?? '?'}`
}

/**
 * 旧键一次性迁移：把 seen-set 里 `…:interrupted-turn:<seq>`（seq 是小数字）改写成
 * `…:interrupted-turn:<宿主纪元>`，时间戳保留——否则换键的当拍，老候选会全部被当新候选重报。
 * 纪元（宿主启动毫秒）远大于任何 seq，按数量级区分，不做脆弱的格式猜测。
 */
export function migrateSeenKeys(entries, hostEpoch) {
  const EPOCH_SCALE = 1e12
  return (entries ?? []).map(([key, at]) => {
    const m = /^(.*):interrupted-turn:(\d+)$/.exec(key)
    if (!m) return [key, at]
    const n = Number(m[2])
    if (n >= EPOCH_SCALE) return [key, at]          // 已是新键
    return [`${m[1]}:interrupted-turn:${hostEpoch}`, at]
  })
}

/**
 * 转录对账（议题 832047A82866-2 ①）：投影说「轮次未收口」，转录才是真相。
 * 最后一条 turn/end 的 seq 若已越过 openTurnStartSeq，说明该轮实际收了、只是投影滞后
 * （2026-10-09 实测误报样本 966c3138：03:40 正常收尾，投影仍非空，被误报）。
 * 没有任何 turn/end ⇒ 轮次真的开着 ⇒ 仍算中断。
 */
export function genuinelyOpen(rows, openTurnStartSeq) {
  let lastEnd = -1
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]?.type === 'turn/end') { lastEnd = i; break }
  if (lastEnd === -1) return true
  const seq = rows[lastEnd].seq
  if (typeof seq !== 'number') return true
  return seq < openTurnStartSeq
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

/**
 * 模型类失败的识别（2026-10-09，样本：claim-d8cdce3c WorkBuddy 额度限频后用户手动切 GLM 恢复）。
 * 这类会话与「未收口」互补：轮次**已经收了**，但收在模型侧错误上（额度/限频/PI_AI_ERROR…），
 * openTurnStartSeq 看不见它们。判据：最后一个 turn/end 的 reason.kind === 'error' 且消息命中
 * MODEL_FAIL_RE，且其后**没有任何 assistant/message**——报错后已有新输出说明有人换模型续跑过了。
 */
export const MODEL_FAIL_RE = /frequency limit|usage exceed|quota|rate limit|PI_AI_ERROR|insufficient (quota|balance|credit)|model (unavailable|overloaded)/i

export function detectModelFailure(rows) {
  let lastEnd = -1
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]?.type === 'turn/end') { lastEnd = i; break }
  if (lastEnd === -1) return null
  const reason = rows[lastEnd]?.data?.reason ?? {}
  const message = String(reason?.error?.message ?? reason?.message ?? '')
  if (reason.kind !== 'error' || !MODEL_FAIL_RE.test(message)) return null
  const resumedAfter = rows.slice(lastEnd + 1).some(r => r?.type === 'assistant/message')
  if (resumedAfter) return null
  return {
    modelFail: true,
    turnEndSeq: rows[lastEnd].seq ?? null,
    code: String(reason?.error?.code ?? ''),
    message: message.slice(0, 200),
  }
}

/** 去重键：带出错的轮次序号——同一轮只打扰一次；之后若在新轮次再犯（新 seq）会重新触发。 */
export function modelFailKey(sessionId, turnEndSeq) {
  return `${sessionId}:model-fail:${turnEndSeq ?? '?'}`
}

/** 注入给故障会话的恢复指令：先换模型、再从断点续跑，换不动就明说。 */
export function modelFailPrompt(fail) {
  return [
    `【模型故障恢复】你上一轮因模型侧错误中断（${fail.code || '模型错误'}：${fail.message}）。`,
    '请先把本会话的模型切换到 zai-coding-cn/glm-5.3-flash（不可用再选其它可用模型），然后从中断处继续：先确认上一步实际做到哪里（以文件与工具结果为准，不要假设），把当前这一步做完并收尾。',
    '若无法切换模型或切换后仍失败，直接说明卡点并停下，不要空转重试。',
  ].join('\n')
}
