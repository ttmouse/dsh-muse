# dsh-muse

> 在 DSH 上复刻 Meta Muse 的核心体感：**一个常驻的长对话，替你盯事、持续推进、值得说时才开口**。

## 这是什么

dsh-muse 不是一个新的对话产品，而是一组 DSH 插件 / preset 组合，把 Muse 的产品内核映射到 DSH 现有架构上。已验证的核心结论：

- **Muse 的产品形态 = 一个持续的长对话窗口**，所有东西（任务、进展、审批卡、主动汇报）汇入同一条流；Goals 标签页等只是查看视图，不是交互主场。
- **DSH 的机制与之高度同构**：session log + `followup()` 队列让定时任务 / job 完成 / 目标续跑都变成普通 turn；`interaction` 的审批卡与 Muse 的 Sentinel 思路同源。
- **真正的差异是持久性层级**：Muse 背后是一台永远在线的云端电脑；DSH 的调度器（schedule timer、goal armed 状态）是进程内权威，进程死了就静默，重开才补账。

## 核心目标（按优先级）

1. **跨进程的持续推进（已实现，见下文「现状」）**：用户授权一次自治后，目标推进不因进程重启而丢失。
2. **冷唤醒（rehydration）**：boot 时扫描持久化待办（schedule 记录、pending inbox），对匹配 session 执行 resume + followup，让主动性自愈。
3. **事件源 ingress**：webhook / file-watch / 外部事件 → 唤醒 agent 的通路（MCP 通知目前只刷工具列表，不能触发 agent）。
4. **记忆 seam**：独立于 AGENTS.md 指令语义的偏好/事实记忆，按相关性注入、模型可写、带生命周期。
5. **「值得打扰」分级门**：后台结果要不要报给用户的判断层。
6. **守护化**：launchd/systemd 包一层常驻宿主（技术最薄，难在 #2 的重启语义）。

非目标（明确排除）：
- 外部通知渠道（Telegram/微信/邮件推送）——用户明确说不急，且不是 Muse 体感的核心。
- 对话式 AI 助手（Continue.dev / Cody 那类）——Muse 的内核是非对话式的持续代理。

## 现状

已在 `deepseek-harness` 仓库落地（未提交，`packages/muse/`）：

| 包 | 职责 |
|---|---|
| `@deepseek-ai/dsh-muse` | 持久自治意图 `muse/intent` 会话事件 + keeper：session-start / 首次 idle 双触发点，用精确 CAS ref 重新武装已 disarm 的 active 目标 |
| `@deepseek-ai/dsh-tool-muse` | 模型工具 `muse_autonomy`：只有人类直接请求能授予/撤销自治；自动续跑、子代理一律拒绝 |
| `examples/headless-agent/muse.cordis.yml` | 开箱组合示例 |

验证：22/22 测试、三树覆盖率 100%、跨进程重启端到端（真实 AgentLoop + JSONL 持久化）通过。

## 文档索引

- [docs/goals.md](docs/goals.md) — 核心机制的精确分析（Muse ↔ DSH 逐项对照与证据）
- [docs/experience-guide.md](docs/experience-guide.md) — 体验指南：三种体感怎么看到（主动唤醒 / 持续推进 / 重启不丢）
- [docs/gaps.md](docs/gaps.md) — 缺口清单与每层的实现边界
- [docs/install-notes.md](docs/install-notes.md) — 桌面端/网页端安装踩坑记录（豁免、元数据、热挂载）

## 安全红线

- 自治授权**只能由人类直接请求授予**，这是不可妥协的边界（继承 `dsh-goal`「activation 永不自动继承」的设计纪律）。
- 接邮箱等高价值账号前，必须先补出站网络审批强制点（Sentinel 式门禁）。

## 安装与版本兼容

- 插件以 npm 包分发：`@deepseek-ai/dsh-muse`（keeper）+ `@deepseek-ai/dsh-tool-muse`（`muse_autonomy` 工具），peer 依赖 `@deepseek-ai/dsh-agent@^0.2.0-rc.2`、`dsh-goal`、`dsh-session`、`dsh-llm`、`dsh-tools`、`cordis@^4`。包内自带 `dsh.bundle.patch` 元数据，装入 profile 的 `bundles` 列表即可被插件面板识别。
- **已知边界**：`muse/intent` 是插件自有会话事件。宿主构建的事件词表是编译期固化的；`Session.append` 无法给插件事件打 `ignorable` 标记。因此在不认识 `muse/intent` 的宿主（如 0.2.0-rc.2）上，恢复一个含该事件的持久化日志会被持久化层拒绝（`SessionFormatUnsupportedError`）。自治决策在同进程内完整可用；跨进程重放的 durable 重启语义需要宿主词表包含 `muse/intent`（仓库集成版）或未来宿主提供插件事件注册点。重启测试对该边界做了显式断言。

## 开发

```sh
pnpm install
pnpm run build   # tsc -b 产出 lib/types，tsdown 产出 lib 运行时
pnpm test        # vitest，24 例（含跨进程重启端到端）
```
