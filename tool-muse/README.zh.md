# @deepseek-ai/dsh-tool-muse

[English](README.md) | 中文

模型面向的 `muse_autonomy` 工具：在 direct-human 权限下记录会话的持久自治决策（`muse/intent`）。它是 [`dsh-muse`](../muse/README.md) 的 intent 生产者；keeper 消费该决策并在重启后重新武装目标推进。

## 组合

```yaml
- id: muse
  name: '@deepseek-ai/dsh-muse'

- id: tool-muse
  name: '@deepseek-ai/dsh-tool-muse'
```

## 工具：`muse_autonomy`

以请求的 `autonomy` 布尔值记录一条持久 `muse/intent` 事件并返回 `{ autonomy }`。Latest-wins：再次记录即替换常设决策。

权限镜像 `dsh-tool-goal` 的纪律：调用必须来自活跃 driver 内的确切 live agent、运行时根 agent，且当前轮次内有宿主认证的直接人类消息。自动续跑、子代理与插件来源会被响亮拒绝——只有人类能授予或撤销常设自治。

## Model Experience

### 请求上下文与条件

#### 模型看到什么

`muse_autonomy` 的工具 schema 与描述，见生成的[工具目录](../../../docs/tool-catalog.md)；本页不记录差异。工具结果是紧凑 JSON `{"autonomy":boolean}`。

#### Token 效应

固定、条件性：只要插件被组合，工具 schema 与描述即存在；每次调用向当前轮次追加一条紧凑结果。

#### KV Cache 效应

追加式：工具 schema 属于稳定提示词前缀；每次调用的结果扩展当前轮次历史，不替换更早内容。

## 已知限制与延期工作

- **没有人类命令** — 不经模型往返、直接记录同一决策的人类侧 `/muse` 命令属于延期项；工具路径已要求人类通过模型轮次表达。
- **无按目标作用域** — 该决策是会话级的；按目标的自治表面需要不同的持久记录，属于延期项。
