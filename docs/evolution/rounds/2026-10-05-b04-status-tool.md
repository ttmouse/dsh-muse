# R-B04-status-tool · 当前会话状态摘要

- 日期 / 检查时刻：2026-10-05 Asia/Shanghai
- 候选：B04 → waiting
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

- `tool-muse` 新增只读 `muse_status`，合并当前 session 的 goal 阶段、武装状态、剩余轮数、阻塞原因，以及 routines 的状态、预算、下次运行、最近结果与下一步；不返回 routine prompt、不访问其他 session、不写数据。
- 本地 `dsh-tools` 契约确认 Web Client 通用工具卡展示持久化结果文本，不消费 `presentCall()`。因此 `muse_status` 现在把结果格式化成分行中文状态摘要，保留结构化返回值；日期明确标成 UTC，避免把服务器时区假装成本地时区。
- `examples/muse-status.sh` 改为只显示 gate/reflect 日志的修改时间与行数，不再把原始消息打到终端；`node examples/muse.mjs status` 实跑退出码 0，展示当前组件状态和日志元数据。
- 现有 `examples/muse-dashboard/muse-dashboard.html` 只汇总巡逻、记忆和想法，不显示当前 goal/routine 执行状态或预算；静态系统仪表盘不满足本候选合同。
- 工程验证：`pnpm --filter @deepseek-ai/dsh-tool-muse build` 退出码 0；tool-muse 包测试 10/10；`muse` 包测试 30/30。`muse/tests/restart.spec.ts` 挂载真实 AgentLoop、GoalService、Muse、tool-muse，分别验证空状态和有 goal/routine 的可读结果；合成直接人类 turn 创建临时数据，测试结束前撤销授权，并断言 prompt 未泄露。`bash -n examples/muse-status.sh`、`pnpm evolution:check`、`git diff --check` 均通过。
- 真实 AgentLoop 集成已覆盖空状态和有 goal/routine，但没有桌面 scratch profile 的交互验证，也没有用户对状态解释是否够用的评价。Browser 交互工具不可用；没有把 Codex 授权伪装成 DSH 直接人类 turn。
- 判定：inconclusive，B04 转 waiting。
- 下一步：在独立 scratch DSH profile 的真实会话中查看无 goal 与有 goal/routine 两种状态，并由用户判断同一输出是否足以说明当前工作、等待原因和剩余预算；当前 profile 已链接本地包，无需重新安装或改配置。桌面交互完成前保持 waiting，不改生产 profile，不把集成测试当成用户体验验收。
