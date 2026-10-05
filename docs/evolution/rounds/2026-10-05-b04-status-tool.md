# R-B04-status-tool · 当前会话状态摘要

- 日期 / 检查时刻：2026-10-05 Asia/Shanghai
- 候选：B04 → active
- 执行者：主 Agent 单写
- 范围：只读当前 DSH 会话内的 goal 与 routines；不读决策日志，不复制数据到静态文件，不新建调度器
- 验收：一次只读工具调用同时呈现 goal phase/activation/剩余轮数/阻塞原因，以及每条 routine 的状态、runs/maxRuns/剩余次数/下一次执行/最近结果/下一步；缺失 goal 或 routine 时明确表示为空
- 非目标：此工程验证不代表用户找状态更快；真实 DSH 会话中的可解释性和用户评价仍需实测
- 回退：移除新增 read-only tool 和对应文档/测试，既有授权及 routine API 不变

## 基线观察

- `examples/muse-status.sh` 当前只列 launchd 匹配项、gate/reflect 日志尾部、记忆行数和信号文件；不显示当前 goal、routine 预算或等待原因。
- 该脚本直接 `tail -3` 决策日志。gate 在某些分支把候选消息写入同一日志，因此状态查询不应把原始日志内容带入对话。
- 现有 `muse_routine list` 已暴露 session 内的 runs/maxRuns、nextRunAt、waiting/completed/paused 状态、last summary 与 next step；goal service 提供 phase、activation、roundsStarted、maxGoalRounds 和 blockedReason。
- 假设：把这些现有只读字段合并成 `muse_status`，能在不引入第二份状态存储/调度器的前提下，给当前会话一个可读快照。

## 结果与局限

待实现并验证。工程测试通过也不等于用户体感接受；未验证前本候选不得标为 accepted。
