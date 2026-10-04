# 缺口清单与实现边界

按必要性排序的四层，前两层是真正要新写的插件（数百行级，有现成原语可抄：goal-round-driver 的护栏模式、schedule 的 fold→timer→followup 骨架）。

## 1. 冷唤醒桥（rehydration）— 最关键的一刀

boot 时扫描持久化待办（schedule 记录、pending inbox、goal armed 意图），对匹配 session 执行 `agents.resume()` + `followup()`。内核原语全是现成的，纯缺编排层。

**部分已实现**：`@deepseek-ai/dsh-muse` 的 keeper 已覆盖 goal 场景（`muse/intent` 持久授权 + session-start/首次 idle 双触发点重新武装）。剩余：schedule 记录与 pending inbox 的自动唤醒。

## 2. 事件源 ingress

全仓没有 webhook/file-watch/外部事件 → agent 的通路。MCP 推送只刷工具列表（`mcp-client/connection.ts`），不能触发 agent。「有新邮件就行动」今天只能靠 `every` 轮询模拟。

## 3. 守护化

`dsh web` 是前台进程，无 daemonize/崩溃自恢复。launchd/systemd 包一层即可，难的是第 1 条的重启语义。

## 4. 记忆 seam — 决定像不像「你的」Muse

缺一个 memory Service Definition：独立于 AGENTS.md 指令语义的偏好/事实记忆、按相关性注入、模型可写、带重要性/过期/合并生命周期。产品体感差距最大的一块。

## 非阻塞项

- **主动分级判断**：可先用类型化窄判断（分类/打分）代替完整方案。
- **出站审批强制点**：接邮箱等高价值账号前必须有（Sentinel 式：凭证不出域、出站流量全审批）。

## 动手前需验证的不确定项

- web host 是否存在未读到的 idle-evict 逻辑。
- resume 是否在某些入口已自动 wake pending inbox。

## 已验证可用的最小闭环

`goal + goal-round-driver + muse + tool-muse` 组合：人类授权 → goal 推进 → 进程销毁 → resume → keeper 凭持久 intent 自动恢复 → 继续推进。headless one-shot 宿主会在首个 quiescence 退出，抢在 driver 延迟续跑之前——持续推进需要 web GUI 这类常驻宿主，此边界已写入快照测试。
