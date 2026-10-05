# @deepseek-ai/dsh-muse

[English](README.md) | 中文

Muse 自治 keeper + 有界的、人类授权的定时例程，运行在一个持久会话里。见 [timer-first 指南](../docs/timer-first.md)。

装载本插件会改变 goal 子系统刻意设定的默认值——激活状态从不跨进程边界继承（[goal-round-driver](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal-round-driver)）。有了 Muse，一份绑定人类消息的授权文件记录下「人类要持续主动推进」；插件把这份记录视为人类的常设授权，在会话恢复活跃时重新武装当前 active 目标。插件自己没有驱动：`dsh-goal-round-driver` 对已武装目标的推进方式与从前完全一致。

## 组合

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'

- id: muse
  name: '@deepseek-ai/dsh-muse'
```

本插件必须组合在 `goal` 之后；keeper 只通过 `ctx.goals` 观察持久 phase 与进程内激活，从不依赖监听顺序。

轮次预算耗尽的目标保持 disarm；自治永不增加该预算。

Bundle 自插 Loader entry。源码链接安装的宿主：有 `snapshotEvents()` 的用之，本源码 checkout 用 `events` getter。keeper、tool、invariant 共享 `museSessionEvents`——它保留完整不可变日志，且默认不授予自治。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `defaultAutonomy` | `false` | 已废弃且被忽略：配置文件不能授予人类权威。 |
| `routinePollSeconds` | `60` | 原生 routine/邮箱扫描间隔；无到期事项时不产生模型 turn。 |

## 持久授权

新的授权是 `$DSH_HOME/muse/intents/` 下的 owner-only 文件，绑定到不可变会话日志中经宿主认证的直接人类消息 ID/序列。`muse_autonomy` 保存决定前先校验该输入。缺失或外来的证明永不授予自治。旧 `muse/intent` 事件在宿主可加载时仍然折叠；本版本不引入新的未知必需事件。被拒绝的旧日志不会自动重写。

## 行为

keeper 在每个 live-agent epoch 内解析一次自治：以最新的已验证授权为准；配置永不作为回退授权。两个触发点覆盖两种 epoch 形态：`agent/session-start` 覆盖恢复 epoch——包括队列保持为空、永不发出 idle 迁移的恢复——重武装被推迟到 goal 服务的同步 session-start disarm 之后；首次 `idle` 观察覆盖自治在会话中途经 `muse_autonomy` 到达、而当前目标处于 disarm 的 epoch。当自治成立且当前目标为持久 `active` 但进程内 disarm 时，keeper 用该目标的精确 CAS ref 调用 `ctx.goals.resume`；`goal-round-driver` 观察到 `goal/changed` 并继续轮次。`paused`、`blocked`、`complete` 阶段的目标保持不动——恢复它们是产品决策，keeper 不单方面替你做。

重启证据在 `tests/restart.spec.ts`：真实 AgentLoop、goal 家族与 JSONL 持久化在一条已记录授权下跑完第一轮，整个 context 销毁，新 runtime 恢复会话后跑第二轮——而没有自治的会话保持 disarm。

## Model Experience

### 请求上下文与条件

#### 模型看到什么

什么都不看到。自治决定、其持久授权文件与重新武装调用对模型不可见；重新武装只以 `dsh-goal-round-driver` 的普通 `<goal_round>` prompt 形式出现——该包有自己的文档。

#### Token 效应

零直接影响。间接地，经由 `dsh-goal-round-driver`：恢复后的 epoch 继续追加 driver 的轮次 prompt——每轮一个固定指令块，与会话从未中断时完全一致。

#### KV Cache 效应

无直接影响。重新武装产生的追加式轮次 prompt 与 driver 已有的相同；本包的会话事件不进入派生历史，现有可复用前缀得以保留。

## 已知限制与延期工作

- **无人类侧命令**——模型侧的 `muse_autonomy` 工具（[`dsh-tool-muse`](../tool-muse/README.md)）是唯一已交付的生产者；不经模型往返即可记录决定的 `/muse` 命令为延期项。
- **仅 active 阶段重新武装**——paused 与 blocked 的目标永不自动恢复；重新介入策略（blocked 目标何时 reconsider、频率如何）延期而非臆测。
- **无重复上限**——恢复后的 epoch 每个 live-agent epoch 只重新武装一次；长寿命进程在轮数上限耗尽后由 driver 的 `round-limit` 策略保持目标 disarm。
- **One-shot 宿主首轮静默即退出**——headless 一次性应用不等待 round driver 的延迟续跑，初始任务之外的自主轮次需要常驻宿主（web GUI）。keeper 的持久授权正是这类宿主恢复的依据；`tests/restart.spec.ts` 证明了恢复路径。
