# @deepseek-ai/dsh-muse

[English](README.md) | 中文

Muse 自治保持器：为单个会话提供持久化的自治决策，并在重启与复会后自动重新武装（re-arm）其目标推进。

挂载本插件会改变 goal 子系统的有意默认——activation 从不跨进程边界继承（见 [goal-round-driver](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal-round-driver)）。启用 Muse 后，会话日志中携带一条持久的 `muse/intent` 记录，表明用户希望持续主动地推进目标；插件把这条记录视为常设的人类授权，在会话重新变为 live 时重新武装当前 active 的目标。本插件不拥有自己的 driver：`dsh-goal-round-driver` 仍按原样推进已武装的目标。

## 组合

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'

- id: muse
  name: '@deepseek-ai/dsh-muse'
```

本插件必须组合在 `goal` 之后；keeper 只通过 `ctx.goals` 观察持久 phase 与进程内 activation，从不依赖监听器顺序。

轮数预算耗尽的目标保持解除武装；自治权限从不增加该预算。

bundle 插入自己的 Loader 条目。源码链接安装在提供 `snapshotEvents()` 的已安装宿主上通过该方法读取会话事件，在本源码检出中则使用 `events` getter。keeper、工具和 invariant 共用 `museSessionEvents`；它保留完整的不可变日志，不会默认授予自治权限。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `defaultAutonomy` | `false` | 应用于日志中没有显式 `muse/intent` 决策的会话的自治值。仅挂载插件本身从不授予常设自治。 |

## 会话事件

| 事件 | 载荷 | 含义 |
|---|---|---|
| `muse/intent` | `{ kind, version, autonomy, updatedAt }` | 一条持久的自治决策。日志中最新的事件是唯一权威；更早的 intent 只是历史。没有任何 intent 事件意味着该会话从未表达过自治。 |

v1 中插件只读取 intent，不附带生产者（见限制）。写入方使用 `agent.session.append('muse/intent', museIntentChange(autonomy, Date.now()))`。

## 行为

keeper 每个 live-agent epoch 解析一次自治：取最新的 `muse/intent` 事件，回退到 `defaultAutonomy`。两个触发点覆盖两种 epoch 形态。`agent/session-start` 覆盖 resume epoch——包括队列保持为空、从不发出 idle 迁移的 epoch——重新武装被延迟到 goal service 同步的 session-start 解除武装之后。首次 `idle` 观察覆盖自治在会话中途经 `muse_autonomy` 到达、而当前目标恰处解除武装状态的 epoch。当自治成立且当前目标处于持久 `active` 但进程内已解除武装时，keeper 用该目标精确的 CAS ref 调用 `ctx.goals.resume`；`goal-round-driver` 观察到随后的 `goal/changed` 并继续推进轮次。处于 `paused`、`blocked` 或 `complete` phase 的目标保持不动；恢复它们是 keeper 不单方面做出的产品决策。

重启证据位于 `tests/restart.spec.ts`：真实 AgentLoop、goal 家族与 JSONL 持久化在记录 intent 后跑完第一轮，整个 context 死亡，新运行时恢复会话后第二轮继续运行——而没有自治的会话保持解除武装。

## Model Experience

### 请求上下文与条件

#### 模型看到什么

什么都不看到。自治决策、其 `muse/intent` 会话事件与重新武装调用从不面向模型；重新武装只以 `dsh-goal-round-driver` 普通的 `<goal_round>` 提示呈现，而那由该包自己文档化。

#### Token 效应

无直接 token 效应。间接地，通过 `dsh-goal-round-driver`：恢复后的 epoch 会继续追加 driver 的轮次提示，每轮一个固定指令块，与不间断的会话完全相同。

#### KV Cache 效应

无直接影响。重新武装产生的追加式轮次提示与 driver 已拥有的完全相同；本包的会话事件从不进入派生历史，因此既有的可复用前缀得以保留。

## 已知限制与延期工作

- **没有人类侧命令** — 模型面向的 `muse_autonomy` 工具（[`dsh-tool-muse`](../tool-muse/README.md)）是当前唯一随包的生产者；不经模型往返、直接记录该决策的 `/muse` 命令属于延期项。
- **只重新武装 active phase** — paused 与 blocked 的目标从不自动恢复；重新介入策略（blocked 的目标何时应被重新考虑、频率如何）是延期项而非猜测值。
- **无重复上限** — 恢复后的 epoch 每个 live-agent epoch 只重新武装一次；长驻进程中轮次配额耗尽的目标保持解除武装状态，这由 driver 自身的 `round-limit` 策略负责。
- **一次性宿主在首个 quiescence 即退出** — headless 一次性 app 不会等待 round driver 延迟的续跑，因此初始任务之外的自主轮次需要常驻宿主（web GUI）。keeper 的持久 intent 正是这类宿主恢复时所依赖的；`tests/restart.spec.ts` 证明了该恢复路径。
