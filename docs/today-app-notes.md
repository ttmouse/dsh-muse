# Today.app 拆解笔记（2026-10-05，v1.20.7 初拆 + v1.21.3 深拆汇总）

对标对象：`/Applications/Today.app`（ai.today.macos，Electron；初拆 v1.20.7 / 421M，深拆 v1.21.3 / build 2000115，CN 区）。
方法：asar 解包 + 静态分析（shell 层 + web-runtimes 层 + today-demo 演示包）。云端生成逻辑不可见，以下全部为客户端可证事实。

## 0. 本次新增证据源（v1.21.3）

- 壳层 `app.asar`：`today-desktop-cn`，依赖极少（undici/zod/set-cookie-parser + `@todayai-labs/demo-mode`），确认「薄壳」判断。
- `web-runtimes/prod.asar`：完整 Next.js 服务端应用，路由树可见：`/today`（v1/v3）、`/diaries`、`/memories`、`/health/{signals,notes,reports}`、`/tasks/routines`、`/routines`、`/chat`、`/connectors`、`/skills`、`/rapport`、`/channels`、`/calendar`，API 有 `today-pages`、`live-widgets`、`widgets`、`ws`、`recordings`。
- 简报枚举（API 层 zod 契约）：`briefId ∈ {morning, evening, health}`，brief kind ∈ `{morning_brief, morning_brief_v3, evening_brief, weekly_health_report}`，启用/排程走 `PUT /v2/today-pages/briefs/{id}/enabled`（云端转发）。
- `Resources/today-demo/*.todaydemo`（zip 包）内含**完整的卡片作者指南**（GUIDELINES_FEED.md / GUIDELINES_LIVE_WIDGET.md）与示例 widget 源码——这是截图里「晚间简报」卡片的生成契约，见 §5。

## 架构观察

1. **薄壳 + 可热更的 web 运行时**：Electron 壳只 24M，真正的 agent 大脑是 `Resources/web-runtimes/prod.asar`（75M，Next.js 服务端应用），带独立 manifest/buildId/环境（prod），**壳与大脑分离、各自热更**——与我们「launchd 巡逻层 + 会话层」的分层同构，但他们的运行时是完整本地 Web 服务。
2. **macOS 原生工具带**（`Resources/tools/macos/`）：`today-jxa-runner`（JXA/AppleEvent 执行器，带 busy/执行上限超时处理）、`Today AEX Client`（AppleEvents）、`today-credential-key-store.node`（keychain 级凭证存储）、`today-mac-native-bridge.node`。
3. **主动性功能是「一等模块」**：meeting-reminder 拥有专属 API 模块 + 渲染页面 + 菜单 API——每个主动功能 = 后端检测 + 独立 UI 面 + 专用通道，不是散落的 if。

## 可学习的四个模式

### L1 事件感知不走云 OAuth，走 OS 原生（最有价值）
`today-jxa-runner` 通过 JXA 直接读 macOS 日历/提醒事项（产物里有大量 Calendar 引用）——**本机日历事件感知不需要任何云授权**。对我们：gate 新增 `jxa-calendar` source，用 `osascript` 读日历即将到来的事件 → 判断门 → 「一小时后有会」级别的主动提醒。这直接绕开 C2 的 OAuth 阻塞，且覆盖用户日历场景（用户已明确不要邮件）。

### L2 权限引导是结构化文案，不是报错
`permission-guide-copy.json`：每个需要 OS 授权的源都配了引导文案（WeChat FDA、日历权限同款场景）。对我们：source 规则支持 `permissionGuide` 字段——gate 遇到 EPERM 类失败时，向用户输出**该 source 专属的授权引导**，而不是沉默或裸报错。今天已实测有价值（我们的微信授权就是踩这个）。

### L3 凭证进 keychain，不进文件
`today-credential-key-store.node`（native 模块）。我们目前用 0600 yaml（够用但有风险窗口）；远期可切 keychain。

### L4 AppleEvent 竞争显式处理
JXA runner 明确处理「host busy / 执行超限」超时——系统自动化必然遇到资源竞争，宁可超时重试也不悬挂。我们 gate 的经验（会话忙碌压住注入）同源。

## 行动项

- [x] gate 新增 `jxa-calendar` source：JXA 读日历事件 → 判断门 → 提醒（已实测捕获节假日事件）
- [x] source 规则支持 `permissionGuide` 文案字段；权限失败时输出引导（imap/jxa 实测）
- [ ] 远期：凭证迁 keychain（暂缓，yaml 0600 够用）

---

## 5. 简报卡片体系（v1.21.3 深拆，对应「晚间简报」截图）

### 5.1 三种简报 + 卡片流水线

- 简报按**时段分三份**：morning / evening / health（weekly），各自独立 enabled + schedule（`briefSettings.status / schedule` 可单独开关与排程）。这印证我们「唤醒与打扰分离、目标级专属日程」的节奏设计：不是一条全局 cron，而是每类产出有自己的节拍。
- 简报页 = **按日期组织的卡片流**（`opalToday.sectionTitle`：晨间简报 / 晚间简报 / 日记 / 健康报告；`todayV3` 按日加载、可「加载更早日期」）。
- 卡片分两类，契约完全不同：
  - **feed card（快照卡）**：agent 生成、整体推送、只读、下次生成整体替换。截图里的「晚间盘点」「口径决策点」「今晚最小动作」全是这种。
  - **live widget（活卡片）**：钉在画布上、有持久 doc 状态、可点击/编辑/迁移（schemaVersion 迁移梯），由 automation 定时重跑（`liveWidget: {pageId, automationId, timezone, lastUpdateTime, nextRunAt}`，demo 里 nextRunAt=04:00 本地）。

### 5.2 feed card 的内容契约（从 demo 源码提炼）

每张卡就是一个数据对象 + 一个纯渲染函数，结构固定为：

```
eyebrow:   'WORK · 09:30'          // 域 · 时刻 的眉标
title:     一句话判断（不是主题，是结论）
description: 2-3 句展开：为什么是这个结论
metric / metricLabel: 单个大数字（'3' + 'decisions ready'）
items:    3 条左右的具体清单
action / actionLabel: 把下一步转成一句用户口吻的话，塞进聊天输入框
```

关键机制：卡片 CTA 用 SDK `Action action='chat.composer.fill'`——**点击按钮不是执行，而是把一句现成的 prompt 填进 composer**（如 "Help me prepare the launch rehearsal."）。这正好是我们的全局不变量「想法只提议不执行」的产品化表达：卡片给判断和弹药，扣扳机永远由人在会话里完成。可用 action 目前仅三种：`chat.composer.fill` / `web.open` / `connector.navigate`。

指南里还有两条与我们同源的设计纪律，值得写进我们的卡片规范：

- 「feed card 是时间快照，不持久化状态；下一轮生成整卡替换，不做本地迁移」——对应我们「简报按旧状态读、每轮重算」。
- 「活卡片用于用户要动手改的东西（勾选、排序、计数），纯阅读物一律 feed card」——两类产物生命周期不同，不要混。

### 5.3 对照截图反推的晚间简报生成逻辑

截图三张卡与上述契约一一对应，且每张卡都带**明确的口径声明**：

1. 「晚间盘点」：eyebrow=日期，title 是一句话结论（"外部读到 0 条信号，连续第四天空读"），三个大数字（本轮信号 0 / 连续空读 4 天 / 记忆里等拍板 3 条）+ 逐日空读条 + 数据来源声明（"飞书、健康：可读，0 条；其余来源本轮不可读，并非断开"）+ 两个 composer.fill CTA。
2. 「记忆快照」：显式区分**记忆基线 vs 本轮核实**（"本页所有进度数字都来自记忆而不是本轮核实"），画出 09-30 快照 → 10-04 的时间线，声明"读不到≠断开"。
3. 「最小动作」：从所有队列里只挑 1 件事排第一（带成本标签"成本最小"），并引用行为数据（"你的消息在凌晨最集中，618 条里 03 时 54…"）来论证"21:36 之后到睡前是合适时段"。

可提炼的四条生成原则（可直接写进我们 reflect/简报的 prompt 纪律）：

- **先报口径再报数字**：每个数字必须带来源与覆盖范围；读不到就说明读不到，不许脑补成"安静"。
- **结论式标题**：title 必须是可反驳的判断句，不是栏目名。
- **区分事实层与记忆层**：stale 数据显式标注基线日期，不与今日实测混排。
- **每卡只推一个最小动作**，动作文案 = 可直接发送的 prompt（composer.fill），且给"今早再说"类的退出项。

### 5.4 与 dsh-muse 的映射建议

- 我们的 gate/reflect 产出可落成同样的双形态：**只读快照 → feed card**（每轮整体替换），**可操作物（任务板卡片、勾选清单）→ live widget 形态**（持久 doc + 版本迁移）。
- 简报节奏照抄三份制：晨间（今日计划）/ 晚间（盘点+最小动作）/ 周报（健康类总结），各挂各的 schedule，而不是一条 heartbeat 包打天下。
- CTA 语义对齐 DSH：卡片按钮 → 往对应会话注入一条现成 prompt（等价 composer.fill），保持"提议不执行"。
