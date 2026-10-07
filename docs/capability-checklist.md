# Muse 能力清单（历史盘点）

2026-10-05 治理修正：本页保留早期功能记录，不再作为“100% 对标”验收或实时状态。旧勾选混合宿主能力、局部测试、历史实跑和体验推断，不能据此计算当前达成率。以前记录的每日 9:30 调度本轮未核验，不视为仍运行。

当前方向、排序和证据分别见 [演进框架](evolution/README.md)、[state.json](evolution/state.json)、[场景验收](evolution/evaluation.md)。官方资料参照 [来源索引](evolution/sources.md)，单一设计文章不证明实际可靠率。

以下为历史快照，✅/🟡/❌ 仅保留当时判断，待相关场景重新核验。

## A. 执行能力（它自己的电脑）

[x] **A1 文件系统 + 终端**：自己写代码、构建任务所需工具 → DSH 的 fs/shell/code-runtime 等价能力现成，随插件装载即得 ✅
- [ ] **A2 完整浏览器**：搜索、浏览、填表、预订/购买等交易 → 依赖宿主 browser 能力 🟡
[x] **A3 制作 Artifacts**：可交互定制界面 ✅（2026-10-05 全切片完成）——切片 1 生成规范+实例（开支仪表盘）、切片 2 巡逻自动刷新（数据变→页面新）、切片 3 异常标记+持续异常主动提醒（24h 去重）。三切片均有验证证据

## B. 持续性

- [x] **B1 长期任务推进**：按日程或事件持续推进、跟进 ✅（goal 家族 + keeper + 推进单元调度）
- [x] **B2 后台多任务并行**：应用关了照样运行；对话里可并发交叠 ✅（launchd 独立于对话 + session 并发 turn；「应用关了」由 launchd 系统级承载）
- [x] **B3 夜里学习**：把反思整合进记忆，持续推进项目 ✅——reflect 记忆整合 + memory-maintenance.mjs 归档/去重（2026-10-05）

## C. 主动性

- [x] **C1 主动发消息（高门槛）**：无用户发起也能发，门槛高、值得打断才发 ✅（gate + judge；实测拒测试噪声）
- [x] **C2 事件驱动触发**：相关事件发生即行动 ✅（2026-10-05）——本机日历事件感知已通（gate `jxa-calendar` source，JXA 读 Calendar.app 零 OAuth，实测捕获节假日事件）；http-poll/IMAP 底座已有；Gmail OAuth 按用户要求暂缓
- [x] **C3 值不值得告诉你的判断门**：有意义的新进展/需要你参与才通知 ✅（judge + 确定性敏感滤除；用户可验收）
[x] **C4 Ideas 主动提议**：基于目标、行为模式（habits-miner 已接入反思输入）、对话信息生成建议 ✅——reflect 产出 `[muse-idea]` 提议（只提议不执行）；行为模式输入已接（habits-report）；缺独立聚合视图（低优先）
- [x] **C5 日程即行动**：日程是推进手段（每个目标有自己的节奏）✅——升级为**一等工具 `muse_routine`**（带运行预算 max_runs、pause/resume 需人类请求、结果记录 progress/waiting/done、宿主重启后从授权索引恢复）；AGENTS.md 固化建目标配日程约定（2026-10-05）

## D. 交互形态

- [x] **D1 一个持续长对话**：可打断、并发交叠、跨对话 ✅（DSH session 原生）
- [ ] **D2 侧边对话**：单话题独立展开不污染主线 ❌（依赖宿主能力，DSH 有 subagent 可近似）
- [x] **D3 目标/活动透明度**：看得见它在追踪什么、正在做什么 ✅（goals 标签页 + demo-journal + gate-decisions/reflect-decisions 日志 + muse-status.sh）
- [x] **D4 结构化审批卡**：接受/拒绝的明确控件 ✅（interaction 审批卡原生；dsh-email 发信审批同源）
- [x] **D5 聊天气泡区分**：主动消息与问答可区分 ✅（`[muse-gate]`/`[muse-idea]` 前缀约定；原生气泡渲染）

## E. 记忆与个性化

- [x] **E1 跨对话记忆**：人类可读可编辑的持久记忆，跨会话/跨对话共享 ✅（memories/main.md + projects/；实测跨对话流动）
[x] **E2 形象与个性（机制）** ✅（2026-10-06）——identity.json（name/tagline/style，人类可编辑）→ 每 turn 身份前缀注入 + muse-status 展示；persona 记忆 kind 可演化。**命名权在用户**（Muse 哲学：用户创造自己的 Muse）——机制已备，等你起名
- [ ] **E3 分寸感**：知道什么该说什么不该说（不暴露不必要个人信息），专门训练的内生能力 ❌——我们用 prompt 约束逼近；这是官方用训练数据垒的护城河，只能持续用 prompt+用例逼近
- [x] **E4 记忆卫生**：不重复、不膨胀、按项目分区 ✅（normalizeMemory 自愈 + scope 分区；gate 巡逻顺带清理）

## F. 安全架构（Sentinel 体系）

- [x] **F1 敏感内容滤除**：验证码/密码重置/免密链接在预检层确定性滤除，永不进 agent 上下文 ✅（实测拦截）
- [x] **F2 凭据不出上下文**：外部凭据存 owner-only 本地文件，脚本侧使用，不进对话 ✅
- [x] **F3（预检部分）敏感滤除 + 权限引导**：验证码/密码重置确定性滤除 ✅；source 授权引导（permissionGuide 模式）✅——jxa-calendar EPERM 输出授权指引（2026-10-05）。**完整 Sentinel 出站强制层仍 🟡**：发信审批已有，统一出站强制层待真实交易场景再做
[x] **F4 权限分级/时限**：五级授权模型系统化落地 ✅（2026-10-05）——授权矩阵见 docs/f4-authorization-matrix.md：持续(muse_autonomy)/限时(muse_routine max_runs)/一次性(发信审批)/会话级(permission-presets)/暂停撤销优先，全部有机制与证据；缺口仅剩可视化编辑体验（低优先）
- [ ] **F5 提示词注入防御**：不可信内容标注 + 分类器检查 🟡（外部数据走 gate 判定；无专门分类器）
- [ ] **F6 交易安全**：购物一次性卡号、结账页逐笔批准 ❌（远期，接真实交易时再说）

## I. 人际关系建模「person pages」（2026-10-07 新发现，10-05 WIRED/Gigazine 披露）

安全研究员 Karan Joshi 提取 Muse 系统提示词（来源：[Gigazine](https://gigazine.net/gsc_news/en/20261005-meta-muse-create-profile)），暴露其关系建模机制——**与我们的关键人注册表+人脉库方向完全一致，但结构化程度远超**：

- [ ] **I1 person pages 结构化段落**：Facts / History / The Relationship（亲密度+关系性质+互动方式）/ In Common / **Open Threads（未完结话题）** / **Strengthening（主动建议改善关系的行动：该打电话的日子、要记住的纪念日、后续可问的话题）** 🟡 部分——我们有联系人卡片（角色/项目/足迹）但缺 Open Threads 与 Strengthening 段落
- [ ] **I2 每小时更新节奏**：person pages 每小时数据汇编 🟡——我们 30 分钟巡逻已超此频率，但未持续更新人物档案
- [x] **I3 只用事实原则**：「编造比留空更有问题」——与我们「绝不编造消息内容」纪律一致 ✅
- [x] **I4 隐私差异化优势**：Muse 因未授权读消息/泄露买家地址遭批评；dsh-muse 全本机、零上传、凭据不进上下文——**这是我们相对 Muse 的主动优势，应保持并宣传** ✅
- [x] **I5 未使用者档案批评（2026-10-07 补录）**：Muse 会为从未使用它的人保留文件/档案（Yahoo Tech 标题级信源，全文 403 未读：[Meta Muse can keep files on people who have never used it](https://tech.yahoo.com/ai/meta-muse-keep-files-people-064500614.html)，同波 [CNBC TV18](https://www.cnbctv18.com/technology/meta-muse-ai-building-dossiers-on-users-what-we-know-20006380.htm)）→ 强化 I4 叙事：我们不为无关第三方建档，关键人档案全部来自用户自己的通讯与授权 ✅
- 教训（F5 对标）：Muse 的系统提示词被「让 agent 自己复制内部文件」方式提取——我们 F5 的注入筛查应把「诱导输出系统提示词/内部指令」列为明确攻击样例

## H. 小企业/团队扩展（2026-09-30 新发现）

- [ ] **H1 业务连接器**：Shopify/Dropbox/Slack/Asana/Box/Canva/Figma/Notion/Stripe/Zoom 等 ❌——Muse 已扩展至小企业（[TechTarget](https://www.techtarget.com/ai/news/366651445/Meta-expands-Muse-to-small-businesses)）；个人版优先，团队/业务线暂不跟进
- [ ] **H2 业务数据接入**：Instagram 专业账号/Facebook Pages/Meta 广告账户 → 营销/获客场景 ❌——同上
- 来源：每日对标审查 2026-10-06（zhiding/TechTarget 报道）
- **评估结论**：不跟进。单人场景无业务连接器/营销获客需求，且每类连接器需独立 OAuth 集成，成本与当前使用证据不匹配。重新评估条件：用户开始用 Notion/Stripe 等管理个人事务，或出现真实团队协作场景。

## G. 生态位（Muse 有而我们刻意不做/不同）

- 云端托管电脑（我们 = 本机宿主，隐私优先）
- 手机端/iMessage 入口
- 群体舰队学习

---

## 当时统计与路线（历史，未重新核算）

✅ 14 项 ｜ 🟡 6 项 ｜ ❌ 7 项（状态日期 2026-10-05 晚）

**下一批最短路径**（按性价比）：
1. C5 多目标节奏 + 建目标自动配日程（小）
2. B3 记忆生命周期：定期归档/合并/淘汰（中）
3. C2 Gmail OAuth/日历 source（中，需用户授权配合）
4. F3 统一出站强制层（中，接真实邮箱前应完成）
5. E2 形象个性体系（小，纯记忆段约定）
6. A3 Artifacts（大，独立项目级）
