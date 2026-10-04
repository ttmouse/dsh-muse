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

- [ ] gate 新增 `jxa-calendar` source：osascript 读未来 24h 日历事件 → 判断门 → 会前提醒（C2 的本机替代实现，无 OAuth）
- [ ] source 规则支持 `permissionGuide` 文案字段；gate EPERM 时输出引导
- [ ] 远期：凭证迁 keychain（暂缓，yaml 0600 够用）
