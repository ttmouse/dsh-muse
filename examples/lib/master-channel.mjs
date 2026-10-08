/**
 * master-channel — 静默脚本向主控投递简报的唯一通道（stall-patrol / restart-recover 共用）。
 *
 * 2026-10-08 提取：原先只有 stall-patrol 内联这段逻辑，重启恢复要复用时若各自复制一份，
 * 通道规则（自治判断、通知/直投分流、兜底）就会漂移——本仓库已因「多处各写一份」吃过
 * plist 漂移的亏，这里直接抽成单一实现。
 *
 * 通道规则（2026-10-08 实测）：主控会话持有常驻自治时，走站内信箱由 keeper 注入——
 * 主控侧渲染为折叠卡片「收到执行请求」，与人类输入在视觉上分开；未授权时回退直投主控
 * （session/prompt），呈现为普通消息。平台限制：外部脚本不能注入成员会话（agent-busy:
 * owned by subagent routing），成员会话也拿不到调度工具，所以没有「成员转达」这条路。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { callRpc, injectPrompt } from './dsh-client.mjs'

/** 主控最近一次自治授权记录（读 ~/.dsh/muse/intents/ 下属于该会话的最新一条）。 */
export function latestAutonomyFor(home, masterId) {
  const dir = join(home, '.dsh', 'muse', 'intents')
  let latest
  try {
    for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
      try {
        const rec = JSON.parse(readFileSync(join(dir, name), 'utf8'))
        if (rec?.sessionId !== masterId) continue
        if (!latest || (rec.updatedAt ?? 0) > (latest.updatedAt ?? 0)) latest = rec
      } catch {}
    }
  } catch {}
  return latest
}

/**
 * 把简报投递给主控，返回实际走的通道（'notice' | 'master'）。
 * @param options.url - DSH 地址
 * @param options.home - HOME
 * @param options.masterId - 主控会话 id
 * @param options.brief - 简报正文
 * @param options.tag - requestId 前缀（便于追溯来源）
 */
export async function deliverToMaster({ url, home, masterId, brief, tag = 'muse' }) {
  if (latestAutonomyFor(home, masterId)?.autonomy === true) {
    try {
      await injectPrompt(url, masterId, brief, 'notice')
      return 'notice'
    } catch { /* 信箱不可用时回退直投 */ }
  }
  await callRpc(url, 'session/prompt', {
    requestId: `${tag}-${Date.now()}`,
    sessionId: masterId, mode: 'queue',
    content: [{ type: 'text', text: brief }],
  })
  return 'master'
}
