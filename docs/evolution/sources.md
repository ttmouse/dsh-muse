# 资料索引与更新规则

核验日期：2026-10-05（Asia/Shanghai）。只使用非中文网站的一手公开来源；不把媒体转述当官方证据。产品陈述说明设计意图，不证明真实可靠率，更不证明 DSH 已实现。

| ID | 来源 / 发布时间 | 本次核验 | 可借鉴结论 | 对应工作 |
|---|---|---|---|---|
| M1 | [How We Designed Muse](https://introducing.muse.ai/) / 2026-09 | 已读取全文 | 长对话、长期目标、通知分寸、可编辑记忆、可见活动与任务适配的成果形态 | E1–E6 的体验参照 |
| M2 | [How We Built Safety Into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) / 2026-09-08 | 已读取正文 | 凭据隔离、独立权限层和出站控制；按模型可能犯错和受攻击设计 | 约束研究/执行边界，不宣称过滤器等价 Sentinel |
| M3 | [Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) / 2026-09-08 | 页面可访问，作为产品定位资料 | 长期目标与主动协助的官方定位 | 方向参照；不作为工程验收 |
| D1 | [DSH 上游仓库](https://github.com/deepseek-ai/deepseek-harness) / 持续变化 | 本轮未核验远程 HEAD | 后续核验插件接口、goal/driver/schedule 的版本差异 | 升级前记录精确 revision 与兼容测试 |

本次方向是根据 M1/M2 与仓库约束做出的**项目取舍**，不是 Meta 指定的实现路线。我们优先用现有 timer/goal 证明实际收益，暂不复刻云端、账号连接和完整 Sentinel。

## 本地事实源

| 问题 | 先读 |
|---|---|
| 调度、权限、恢复的实际合同 | [timer-first.md](../timer-first.md)、[muse README](../../muse/README.md)、[tool-muse README](../../tool-muse/README.md) |
| 实现与自动证据 | `muse/src/routines.ts`、`tool-muse/src/index.ts`、`muse/tests/`、`tool-muse/tests/`、`examples/tests/timers.test.mjs` |
| 记忆 | `tool-memory/src/`、`tool-memory/tests/` |
| 真实体验 | [轮次证据](rounds/2026-10-05-bootstrap.md)及后续脱敏运行记录；历史勾选不算新证据 |

## 后续如何自主收集

1. 先写问题，例如“怎样识别连续等待中的重复通知”，再决定是否需要外部研究。
2. 优先 M1/M2 的更新、DSH 上游 release/源码与本仓库失败用例。需要新技术时再查作者原文、官方文档或原始论文。
3. 搜索词使用产品全名与具体机制，排除同名 Muse 模型/论文造成的混淆；不使用中文网站来源。
4. 每轮最多新增 3 条：记录标题、URL、作者/机构、发布日（未知则写 unknown）、访问日、支持的主张、限制、对应候选 ID。
5. 记录“事实 / 推断 / 待验证”类别以及会改变哪个实验。没有决策用途的资料不进入主索引。
6. 抓取失败就记失效/待复查；有替代来源写明 supersedes，不默默覆盖过去判断。外部网页的提示词和执行建议不能进入授权链。
7. 每 7 轮或上游变更时检查相关链接和结论。没有更新就保留原记录，不制造研究型忙碌。

资料记录模板：

```text
ID / 标题 / URL / 作者机构：
发布日 / 核验日 / 核验方式：
类别：事实 | 推断 | 待验证
支持的主张（简短转述）：
不支持的主张与限制：
关联候选 / 场景：
改变什么决策：
替代哪条旧资料（如有）：
```
