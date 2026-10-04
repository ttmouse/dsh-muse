# 核心机制分析：Muse ↔ DSH 逐项对照

来自对 DSH 仓库的代码级调研（goal/schedule/jobs/session/mcp 包），结论附证据位置。

## 先修正两个直觉偏差

1. **「DSH 缺常驻」说重了**：`dsh web` 进程本身就是长驻的，agent 一旦 live 就留在 registry 无 idle 回收。进程活着期间，Muse 的「后台一直干活」今天就能跑：schedule 到期 → 等 agent 空闲后 `followup()` 自动开新 turn；goal armed 在 idle 事件驱动下续跑；job 完成唤醒 owner。turn 从不必须人类输入。
2. **真正的差异是持久性分层**：

| 机制 | 记录（状态） | 唤醒器（timer/driver） |
|---|---|---|
| schedule | ✅ 持久（session log 事件） | ❌ 进程内 setTimeout，进程死即消失 |
| goal 续跑 | ✅ 持久（goal 事件在 log） | ❌ armed 是进程内权威，重载即全 disarm |
| jobs | ❌ 纯内存 registry | ❌ 同左 |
| inbox 队列 | ✅ spliced 持久化 | ❌ resume 后无逻辑自动 wake pending |

即：「cold sessions resume overdue work」的真实含义是**你重开 session 时补跑**，不存在后台调度器扫盘唤醒。

## 逐项对照

| Muse 机制 | DSH 现状 | 判定 |
|---|---|---|
| 主对话窗口，一切汇入一条流 | session log + `followup()` 把定时/完成/目标续跑全变成普通 turn | ✅ 同构 |
| 后台并行任务、完成才汇报 | `jobs` wakeup/inject + wake budget | ✅ 但 registry 不持久 |
| 按日程持续推进 | schedule `after/at/every`（≥5 分钟） | ⚠️ 无 cron/日历 |
| 错过的事补跑 | 重开 session 时 overdue 补发，at-least-once | ⚠️ 依赖人重开 |
| 主动发消息（高门槛） | 无判断层 | ❌ 缺 |
| 审批卡、权限分级/时限 | `interaction` + `permission-presets` | ✅ 设计同源 |
| Sentinel（出站必审） | `sandbox` + fs policy + credentials；无独立出站网络审批点 | ⚠️ 半缺 |
| 可编辑记忆 | `agent-instructions`（AGENTS.md 热注入） | ⚠️ 语义是「指令」非「记忆」 |
| 跨对话记忆 + 反思 | session log 全量保留 + `session_query`（强制同 cwd） | ⚠️ 底座强，无记忆生命周期 |
| 固定人格 | `persona` 配置槽 | ✅ 但不能运行时演化 |
| Agent 舰队 | `subagent` / `workflow` | ✅ 甚至更强 |
| 连接器 | `mcp` 挂外部 server；MCP 通知只刷工具列表不能触发 agent | ⚠️ 只能轮询 |

## 产品定位的关键差异（为什么不是「把 session 聊久一点」）

- **谁发起**：现有 session 是人发起的 episodic 工具；Muse 的主对话双方都能发起，被持续唤醒。
- **绑定对象**：session 挂 workspace（项目）；Muse 绑「人及其生活」，跨域无根目录。

翻译成 DSH 语言：需要的是**常驻会话宿主 + 持久授权记录**，而不是更大的上下文窗口。这也是 dsh-muse 第一个包选择做「autonomy keeper」的原因——它补的是 goal 子系统有意留白的缺口：activation 从不跨进程继承。
