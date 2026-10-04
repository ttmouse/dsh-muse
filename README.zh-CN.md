# dsh-muse（中文说明）

> 给 [DSH](https://github.com/deepseek-ai/dsh) 的 agent 加上 Muse 式的持续性：授权一次，跨重启持续推进；外加「只在该说话时才说话」的静默心跳。

[English](README.md)

## 这是什么

两个 DSH 插件 + 一组体验配方，复刻 [Meta Muse](https://hub-assets-cache.baai.ac.cn/view/58273) 的产品内核：**一个常驻长对话，agent 替你盯事、持续推进、值得说时才开口**。

| 组成 | 职责 |
|---|---|
| [`muse/`](muse/) — `@deepseek-ai/dsh-muse` | 把自治授权持久化并绑定原始人类消息；keeper 在会话恢复时重新武装已 disarm 的 active 目标，长期目标因此能跨进程重启延续 |
| [`tool-muse/`](tool-muse/) — `@deepseek-ai/dsh-tool-muse` | `muse_autonomy` 模型工具：只有人类的直接请求能授予/撤销自治；自动续跑与子代理一律拒绝 |
| [`tool-memory/`](tool-memory/) — `@deepseek-ai/dsh-tool-memory` | `memory_save` 工具 + 每 turn 记忆注入，存储为人类可编辑的纯文本（`~/.dsh/memories/main.md`）——「越用越懂你」的那一块 |
| [`docs/`](docs/) | 机制分析、主动触发设计、安装踩坑、发布清单 |

安全边界继承自 `dsh-goal`：activation 永不自动继承。手动 disarm 永远优先；paused/blocked 目标不会被擅自恢复。

## 安装

要求 DSH 运行时的插件树包含 goal 家族（`dsh-goal`、`dsh-goal-round-driver`）。

```bash
# 在 profile 目录（如 ~/.dsh/profiles/web）
dsh plugin --profile web add <已发布的包名或 git 地址>   # 两个包都装
```

然后把两个 bundle 加进 profile 的 `dsh.profile.bundles`（排在 goal 家族之后）。包自带 `dsh.bundle.patch` 元数据，插件面板会识别为 profile 层插件。若运行时版本与 peer 范围不匹配，按 [docs/install-notes.md](docs/install-notes.md) 在对应 profile 授予兼容性豁免。

## 体验三步

1. **持续推进**：新会话里说「建一个长期目标：`<任务>`。我要离开了，授予自主推进，不用再问我，做到完为止。」→ 看 `create_goal` → `muse_autonomy{true}` → 自主轮次连续推进。
2. **重启不丢**：停掉运行时 → 重启 → 回到该会话说「继续」→ keeper 凭持久授权自动恢复，不要求重新授权。
3. **静默心跳**：按 [docs/heartbeat-recipes.md](docs/heartbeat-recipes.md) 配置「检查但未必说」的心跳；或用 [examples/gate/](examples/gate/) 的对话外闸门做到「没事零痕迹、有事才注入」。

## 文档

- [docs/goals.md](docs/goals.md) — Muse ↔ DSH 机制对照（含证据）
- [docs/experience-guide.md](docs/experience-guide.md) — 三种体感的体验指南
- [docs/proactivity-design.md](docs/proactivity-design.md) — 主动触发设计（事件驱动 + 唤醒/打扰分离）
- [docs/FAQ.md](docs/FAQ.md) — 常见报错与修复
- [docs/capability-checklist.md](docs/capability-checklist.md) — 27 项 Muse 能力对标清单（实时状态）
- [examples/habits/](examples/habits/) — 跨项目习惯挖掘器（主动想法的输入）
- [docs/gaps.md](docs/gaps.md) — 已实现 vs Muse 尚缺（事件 ingress、记忆 seam、外部通知）

## 状态

定时推进闭环已通过包测试和 CLI 集成测试，包含真实 AgentLoop + JSONL 冷恢复。当前重点是同一会话内有预算的持续推进、等待/完成状态和静默反思；外部事件和其他会话暂缓。具体行为、验证与限制见 [docs/timer-first.md](docs/timer-first.md)。

## 许可

MIT

[Timer-first progress loop / 定时推进闭环](docs/timer-first.md) — same-session routines, waiting/completion state, native cold wake, non-human mailbox delivery and proposal-only reflection.
