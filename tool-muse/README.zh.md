# @deepseek-ai/dsh-tool-muse

[English](README.md) | 中文

模型侧 `muse_autonomy` 工具：在直接人类权威下记录一条绑定人类消息的持久自治决定（owner-only 授权文件，侧车存储）。它是 [`dsh-muse`](../muse/README.md) 的意图生产者；keeper 消费该决定并跨重启恢复目标推进。

本包同时提供 `muse_routine`（有预算的定时工作单元）与 `muse_status`（只读状态快照），见下文「定时与状态工具」。

## 组合

```yaml
- id: muse
  name: '@deepseek-ai/dsh-muse'

- id: tool-muse
  name: '@deepseek-ai/dsh-tool-muse'
```

## 工具：`muse_autonomy`

记录一份 owner-only 持久授权文件，绑定当前人类消息、携带请求的 `autonomy` 布尔值，返回 `{ autonomy }`。最新 wins：再次记录即替换常设决定。

权威镜像 `dsh-tool-goal` 的纪律：调用必须来自活跃 driver 内的确切 live agent、运行时根 agent，且当前轮次内有宿主认证的直接人类消息。自动续跑、子代理与插件来源会被响亮拒绝——只有人类能授予或撤销常设自治。

## Model Experience

### 请求上下文与条件

#### 模型看到什么

`muse_autonomy` 的工具 schema 与描述，见生成的[工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)；本页不记录差异。工具结果是紧凑 JSON `{"autonomy":boolean}`。

#### Token 效应

固定、条件性：只要插件被组合，工具 schema 与描述即存在；每次调用向当前轮次追加一条紧凑结果。

#### KV Cache 效应

追加式：工具 schema 属于稳定提示词前缀；每次调用的结果扩展当前轮次历史，不替换更早内容。

## 已知限制与延期工作

- **没有人类命令** — 不经模型往返、直接记录同一决策的人类侧 `/muse` 命令属于延期项；工具路径已要求人类通过模型轮次表达。
- **无按目标作用域** — 该决策是会话级的；按目标的自治表面需要不同的持久记录，属于延期项。

## 定时与状态工具

`muse_routine` 在当前会话创建、列出、暂停或恢复有界任务；管理仍需直接人类授权，创建还需已存在的常设自治授权。`muse_routine_result` 记录当前投递的工作结果与下一步，不能授予新工作或扩展预算。

`muse_status` 只读汇总当前会话的 goal 阶段、武装状态、剩余轮数、阻塞原因，以及 routine 状态、预算、下次运行和最近结果。Web Client 专属工具行折叠时显示目标阶段、剩余轮数、阻塞原因和各 routine 预算；展开后显示同一调用的完整持久化结果。结构化值仍供其他工具消费。它不返回 routine prompt，也不读取其他会话。真实 DSH 交互和用户认可仍未验证。
