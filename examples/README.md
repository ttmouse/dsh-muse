# examples/ — dsh-muse 示例与运行态脚本总索引

本目录是 Muse 体系「对话外主动层」的示例与实际运行脚本集合。每个子目录有自己的 README（gate / reflect / orchestrator），本文是入口总索引，信息来自实际目录内容。

## 子目录

| 目录 | 用途 | 入口 |
|---|---|---|
| [gate/](gate/) | 对话外主动闸门（ingress v0）：确定性预检在对话外运行，没事零痕迹，有事才注入主线。含敏感信息预检（SENSITIVE_PATTERNS）、通知判别（judge）、IMAP/日历信号源 | [gate.mjs](gate/gate.mjs)，详见 [gate/README.md](gate/README.md) |
| [reflect/](reflect/) | 反思循环（Muse 的「持续思考」）：收集记忆 + 主会话近期上下文 → 一次廉价 LLM 反思 → memory_additions / idea（只提议不执行）/ plan_note 三类输出各走各的门 | [reflect.mjs](reflect/reflect.mjs)，详见 [reflect/README.md](reflect/README.md) |
| [orchestrator/](orchestrator/) | 单会话多目标编排 playbook（含 dry-run）：goal-led / routine-led 两种执行模式，worker 派遣三模式（in-session / detached / agent-team） | [demo.mjs](orchestrator/demo.mjs)、[spawn-worker.mjs](orchestrator/spawn-worker.mjs)、[detached-runner.mjs](orchestrator/detached-runner.mjs)，详见 [orchestrator/README.md](orchestrator/README.md) |
| [lib/](lib/) | 各示例共享的本地库：DSH API 客户端（签名 cookie 鉴权、RPC、judge LLM）、出站策略、反思解析/校验 | [dsh-client.mjs](lib/dsh-client.mjs)、[outbound-policy.mjs](lib/outbound-policy.mjs)、[reflection.mjs](lib/reflection.mjs) |
| [habits/](habits/) | 跨项目行为挖掘：扫描 ~/Projects/* 的 git 历史与结构特征，产出习惯报告供反思循环消费（本地运行） | [habits-miner.mjs](habits/habits-miner.mjs) |
| [muse-dashboard/](muse-dashboard/) | 系统健康仪表盘：从巡逻统计 + ideas + 记忆状态生成自包含 HTML | [build.mjs](muse-dashboard/build.mjs) → [muse-dashboard.html](muse-dashboard/muse-dashboard.html) |
| [tests/](tests/) | 示例层测试（node:test）：定时器行为、反思解析校验、记忆追加等 | [timers.test.mjs](tests/timers.test.mjs) |
| [gate/sources/](gate/sources/) | gate 的信号源连接器：IMAP 邮件（[imap.mjs](gate/sources/imap.mjs)）与 JXA 日历（[jxa-calendar.mjs](gate/sources/jxa-calendar.mjs)） | 见 gate/README.md |

## 顶层脚本（本目录直下）

| 文件 | 用途 |
|---|---|
| [muse.mjs](muse.mjs) | 统一 CLI 入口：子命令分发到既有脚本，不带参数输出状态板 |
| [muse-status.sh](muse-status.sh) | gate/reflect/分诊等运行态状态一览 |
| [set-cadence-all.sh](set-cadence-all.sh) | 一条命令调全部节奏：`./set-cadence-all.sh <gate秒> <reflect秒>`（gate 由 launchd 托管） |
| [message-triage.mjs](message-triage.mjs) | 双渠道消息分诊（launchd 承载，静默=零对话接触）：钉钉 @我 + 微信私聊未读 → A 类线索才注入主会话；配套 [message-triage.plist](message-triage.plist) |
| [wechat-deep-triage.mjs](wechat-deep-triage.mjs) | 微信深度分诊：通读最近活跃私聊时间线，分角色判定跟进项；产出记录见 [demo-journal.md](demo-journal.md) |
| [ops-warden-trigger.mjs](ops-warden-trigger.mjs) | 定时把运维 prompt 注入 ops-warden 成员会话（非主控），成员仅在发现 A 类事项时回报；配套 [ops-warden-trigger.plist](ops-warden-trigger.plist) |
| [memory-maintenance.mjs](memory-maintenance.mjs) | 定时友好的记忆维护脚本，`--dry-run` 不写盘 |
| [b03-exp1.mjs](b03-exp1.mjs) | B03 实验：记忆纠正语义（同一主题先写错再纠正，验证纠正与错误条目是否共存） |
| [muse.cordis.yml](muse.cordis.yml) | goal family + muse autonomy 的 profile bundle 示例配置 |
| [demo-journal.md](demo-journal.md) | 深度分诊等真实运行日志（追加式） |

## 运行态注意

- `.gate-state/` 与 `local-config.env`、`*.log` 为本机运行态/凭据，不入库（见根 .gitignore）。
- gate/reflect 实际由 launchd 托管，调频用 [set-cadence-all.sh](set-cadence-all.sh)。
