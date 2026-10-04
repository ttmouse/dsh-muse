# Roadmap：弥补与 Muse 的差距

按「体感收益 ÷ 实现成本」排序。每项标注：落点（在哪个现有机制上长出来）、验收标准。

## P1 连接器事件驱动（Event Ingress v1）——最高优先

**Muse 体感**：盯邮件发现「选拔 12 小时后截止」，主动行动。
**现状**：gate（ingress v0）只能查本机文件/确定性规则；没有外部世界的事件源。

**方案**：gate 的规则层就是挂载点。v1 做三类 source：
1. `poll` source：定时拉取外部 API（邮件 IMAP/Gmail API、日历 CalDAV/ics 订阅、RSS）→ 输出「新事件」列表进预检。纯脚本，沿用现有三级闸门（确定性过滤 → 廉价 LLM 判断值不值得说 → 注入主线）。
2. `watch` source：文件/目录监听（fswatch）替代轮询，进程内常驻版 gate。
3. 规则 DSL 固化：`rules.json` 支持 `{ source, when, message }`，让用户不写代码就能配「收到 X 发件人的邮件 → 通知我」。

**关键决策**：外部拉取的凭据存 `~/.dsh/.credentials.yaml`（现有 credentials 服务），不进会话上下文——邮件验证码/密码重置链接必须在预检层过滤（Muse 的确定性过滤先例），绝不能进 agent 上下文。
**验收**：配置一个 Gmail/IMAP source，真实邮件到达 → 主线收到注入，无事时零痕迹。
**成本**：中等（gate 骨架已就绪，主要是 source 适配器 + 凭据接入）。

## P2 记忆 seam——决定像不像「你的」Muse ✅ 最小版已实现（tool-memory）

**Muse 体感**：夜里学习、越用越懂你、记忆文件可读可编辑。
**现状**：跨会话只有 AGENTS.md（指令语义，不是记忆）。

**方案**：新增 `muse-memory` 包（第三个包，同家族结构）：
- 存储：一个记忆文件（`~/.dsh/memories/<agent>.md` 或 yaml），owner-only 权限
- 写入路径：模型工具 `memory_save`（判断「值得记」时写入，带类型：偏好/事实/项目约束）
- 注入路径：system prompt 附加段按相关性注入（先做全文注入，量小够用；大后再做检索）
- 生命周期：每条记忆带 `updated` 时间戳 + 状态（active/archived），定期心跳里做合并/归档（「夜里学习」的对应物）
- 人类可读可编辑：就是纯文本文件，用户直接改（Muse 同款设计）

**验收**：告诉它一个偏好 → 跨会话新对话里生效；用户手改文件 → 立即生效；过期记忆被心跳归档。
**成本**：中等偏小（工具 + 注入点都是 DSH 现成接缝）。
**已实现（2026-10-05）**：`tool-memory` 包——`memory_save` 工具（kind: preference/fact/lesson）+ `muse:memory` 动态 prompt context（order 125，超 8000 字符截断保留最新）+ 人类可直接编辑的 `~/.dsh/memories/main.md`。6/6 测试，scratch profile 组合验证。

## P3 fuzzy 判断门（值得打扰的模型判断）✅ 已实现

**Muse 体感**：后台结果先判断值不值得告诉你；用户可调频次。
**现状**：gate 第二层预留了「廉价 LLM 判断」，未实现。

**方案**：gate.mjs 加 `--judge` 模式：预检通过的候选项 → 直接调一次廉价模型 API（DeepSeek/MiniMax，走本机已有 key）输出 {worth_saying: bool, reason} → 再决定注入。频次设置 = launchd 间隔 + 判断门阈值，都是配置。
**验收**：同一批噪声候选，开判断门后注入率明显下降且不漏真事。
**成本**：小（一次 API 调用 + prompt）。
**已验证（2026-10-05）**：`gate.mjs --judge`，mock 双分支 + 真实 DeepSeek 冒烟通过；SKIP 时信号文件保留（不消费），SAY 时注入；决策记录在 gate-decisions.log。

## P4 Ideas（主动提议）

**Muse 体感**：持续思考「我能为你做什么」，生成建议不执行。
**方案**：心跳/gate 的一个专属模式：定期（低频，如每天一次）让 agent 基于目标列表 + 记忆生成 1-3 条「你可以让我做 X」的提议，走同一条判断门，注入为「想法」而非行动。依赖 P2（有记忆才有个性化提议）。
**成本**：小（P1/P2 就绪后是纯 prompt 工作）。

## P5 Sentinel 式出站门禁（接高价值账号的前置条件）

**Muse 体感**：凭证不出域、出站流量全审批、一次性卡号。
**方案**：在 gate/source 层强制「出站操作白名单 + 敏感内容过滤」（验证码/密码重置链接确定性滤除）；写入邮件、购买类操作必须经 `interaction` 审批卡。DSH 的 sandbox policy + interaction 已有件，缺的是把「出站」作为独立强制点的编排。
**验收**：模拟提示词注入（外部邮件里诱导 agent 发密钥），出站被门禁拦截。
**成本**：中等；**必须在 P1 接邮箱之前或同时做**。

## P6 守护化 + P7 人设（低优先，独立小件）

- 守护化：launchd 托管 `dsh web`（KeepAlive），崩溃自恢复。薄，但依赖冷唤醒补全（schedule/goal 的重启重放）才值得。
- 人设：persona 运行时演化 = 记忆文件的一部分（P2 的 persona 段），不单独做。

## 依赖关系与顺序

```
P3 判断门 ──┐
P5 出站门禁 ─┼→ P1 连接器 → P4 Ideas
P2 记忆 ────┘
P6/P7 随时可插
```

建议实现顺序：**P3（半天）→ P2（1-2 天）→ P5+P1（3-5 天）→ P4（半天）**。
