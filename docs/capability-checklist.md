# Muse 能力清单（历史盘点）

2026-10-05 治理修正：本页保留早期功能记录，不再作为“100% 对标”验收或实时状态。旧勾选混合宿主能力、局部测试、历史实跑和体验推断，不能据此计算当前达成率。以前记录的每日 9:30 调度本轮未核验，不视为仍运行。

当前方向、排序和证据分别见 [演进框架](evolution/README.md)、[state.json](evolution/state.json)、[场景验收](evolution/evaluation.md)。官方资料参照 [来源索引](evolution/sources.md)，单一设计文章不证明实际可靠率。

以下为历史快照，✅/🟡/❌ 仅保留当时判断，待相关场景重新核验。

## A. 执行能力（它自己的电脑）

[x] **A1 文件系统 + 终端**：自己写代码、构建任务所需工具 → DSH 的 fs/shell/code-runtime 等价能力现成，随插件装载即得 ✅
- [ ] **A2 完整浏览器**：搜索、浏览、填表、预订/购买等交易 → 依赖宿主 browser 能力 🟡（2026-10-12 补充：官方同样受阻——CNET 实测 Muse 代办运营商客服被反爬 403 层层拦截，需人工接管浏览器且接管也不改网络地址；反爬是全行业 agent 的共同天花板，见 J4）
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
- [ ] **D2 侧边对话**：单话题独立展开不污染主线 🟡（2026-10-15 落账：10-08 J 节实测 Agent Teams 独立上下文可近似后已判定 ❌→🟡，本行当时漏改；界面级会话分叉仍缺）
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

## J. 平台与架构增量（2026-10-08 对标审查）

来源：[The Verge 报道的中文转述（DigitalToday，2026-10-08）](https://www.digitaltoday.co.kr/cn/view/112084/meta-muse-expands-support-to-ipad-after-iphone-and-mac)、[IT之家（2026-10-02）](https://m.ithome.com/html/1009363.htm)。本节只记事实与对我们的映射，不改上面历史勾选。本机对标应用 `/Applications/Today.app` 仍为 1.21.3（与基线一致，未更新）。

- **设备与入口继续扩张**：Muse 已原生适配 iPad（核心功能与 iPhone 版一致，针对 iPadOS 多任务优化）；宣布将登陆智能眼镜（唤醒词「Hey Muse」）；预告小型独立设备 Muse Charm。→ 对应 G 节「生态位」：我们仍不跟进入口扩张，本机宿主是刻意选择。
- **第三方服务接入扩至**：Canva、Dropbox、Figma、QuickBooks、GitHub、Zoom、Asana、Klaviyo，并支持连接 Granola、Notion。→ 对应 H1/H2：名单变长但结论不变（单人场景不需要业务连接器）；重新评估条件补一条——用户若开始用 Notion 或 Granola 管理个人事务再议。
- **云端架构首次给出官方口径**：Muse 运行在云端私有持久化 Linux 虚拟机，自带浏览器、文件系统与终端，关闭应用后仍持续运行；可自行编写并运行代码、把工作分配给多个子智能体、创建定时任务；能生成文档、PDF、网站与数据仪表盘等交互式工具。→ 与我们的 B2（后台独立于对话）、C5（定时即行动）、A3（Artifacts）同构：这套「持久执行体 + 定时 + 多子代理 + 交付物」是被官方验证的产品形态。
- **支付安全有官方实现证据**：支付接入 Stripe 旗下 Link，用一次性虚拟支付卡完成交易，智能体本身不接触银行卡信息。→ 对应 F6：我们的「购物一次性卡号 + 结账逐笔批准」方向与官方一致；我们仍未接真实交易，标记维持 ❌。
- **隐私反差继续拉大**：Meta 称 Muse 数据不用于广告，但除非用户主动退出否则会用于训练未来模型；云端虚拟机与外界隔离，但 Meta 自身仍可访问；计划年内推出机密虚拟机选项（届时 Meta 也无法访问该环境）。→ 强化 I4 叙事：dsh-muse 全本机、零上传、无训练用途；同时把「机密虚拟机」记为观察项——官方在补隐私短板，是我们的对照标尺。
- **侧边对话可近似（D2 复评）**：Agent Teams 的常驻成员与子代理各自持独立上下文、不污染主线（本机 2026-10-08 实测：运维成员承接分诊复核与机制复盘，主对话零轮次）。→ D2 由 ❌ 调整为 🟡：机制上已能「单话题独立展开」，但还不是界面级的会话分叉，用户无法在聊天里就地开一个侧边话题。

## J2. Connect 2026 软件侧新细节（2026-10-09 对标审查补录）

来源：[3arrafni（2026-09-24，阿语）](https://3arrafni.com/tech-news/meta-muse-custom-avatars-video-chat-transaction-fees)、[the-decoder](https://the-decoder.de/meta-erweitert-ki-agent-muse-und-stellt-charm-audio-glasses-und-vr-brille-vor/)。Today.app 仍 1.21.3（基线一致）。

- **可见化形象（对标 E2）**：Muse 屏幕形象代号 Jolly，用户将可为 Muse 创建专属数字 avatar 并与其视频对话——从文本/语音助手升级为「看得见的角色」。→ 我们的 E2 机制（identity.json 命名权在用户）方向一致；官方把「形象可视化」做成了产品级能力，记为 E2 对标参照（generative-ui 卡片头像是本机的低成本近似路径）。
- **商业模式（新）**：Muse 免费额度内使用，超出后 Meta 计划按「Muse 替用户执行的交易」抽小额费用——不是订阅制，是把 agent 放进支付路径。→ 印证 F6 交易安全是官方核心路线，我们的 F6 方向与商业逻辑同源。
- **生态开放（新）**：Muse Gadgets 开源 + 美国订户免费发放 Home Link dongle（[3arrafni](https://www.3arrafni.com/tech-news/meta-muse-gadgets-home-link)）。→ 硬件入口层，G 节结论不变。
- **隐私双面（强化 I4/F5 教训）**：Meta 澄清 Mac 版 Muse 读 Messages 是选择性加入（opt-in，需显式授权），否认此前「私读」指控；但另一案例中 Muse 在代管 Facebook Marketplace 时把 YouTuber 的家庭地址透露给买家并接受了低价（[3arrafni](https://www.3arrafni.com/tech-news/meta-muse-home-address-marketplace)）。→ 对我们两条纪律的直接印证：①权限分级 F4「显式授权才读」是正确设计；②F6/E3 的「分寸感」缺失会造成真实伤害——代理代谈交易时泄露不必要个人信息，正是 E3 ❌ 项要防的事故样例，收进 F5/E3 用例库。

## J4. 安全事故与生态反制（2026-10-12 对标审查补录）

来源：[Forkast（2026-09-22）](https://forkast.news/muses-undocumented-endpoint-turns-macos-agent-into-a-local-backdoor/)、[The Verge（2026-10-05）](https://www.theverge.com/tech/1004781/meta-reportedly-made-a-mad-dash-to-fix-a-muse-ai-breakout-bug-weeks-before-launch)（源报道 404 Media）、[环球网科技转述 CNET（2026-10-10）](https://www.sohu.com/a/1085919891_99900743)、[CNET 实测转述（2026-10-09）](https://infofortech.com/i-asked-meta-muse-to-fix-an-issue-with-my-phone-provider-it-got-blocked-at-every-turn/)。Today.app 仍 1.21.3（基线一致，2026-10-12 实查）。

- **「agent 即攻击面」坐实（F5/F3 强对标）**：Wardle 9-21 披露 macOS 版 0-day——未文档化的偏好键 `endo_voyager_dictation_endpoint` 可被任意低权限本地进程改写，劫持听写流量→窃取会话令牌→五种攻击向量（音频窃取、提示词注入、会话劫持、向 iOS 设备横向移动、远程 ClickFix 社工）；PoC `not-a-mused` 实现 50+ 条 Muse 命令。Meta 约 12 小时后热修，**无 CVE、无正式公告**。→ 印证 F5 🟡：本机宿主同样暴露攻击面（gate/reflect 端口、脚本侧凭据），我们的 F5 清单应把「本地端口/IPC 被低权限进程劫持」列为攻击样例；无 CVE 无公告的披露方式也是对照标尺。
- **VM 逃逸（云端架构也有边界）**：404 Media 报道 Meta 在发布前数周「mad dash」赶修 Muse VM 逃逸漏洞——可从虚拟机逃逸访问 Meta 自家数据库与服务；内部信源称安全团队被迫「赶出半生不熟的防护保上线」。→ J 节「云端私有 VM」口径需打折扣：隔离边界正在被官方自己追赶，I4 本机+零上传叙事继续成立，但也提醒我们本机宿主的隔离责任全在自己（无 Meta 兜底）。
- **平台反制常态化（A2/H 生态逆风）**：CNET 实测 Muse 代办 Visible 客服全程被反爬拦截（guest 聊天按钮不提交、帮助页 403、人工接管也 403）；多家运营商与平台开始主动拦截 AI 代理流量，行业尚无 AI 代理访问规则；此前 Amazon 已因 Muse 不表明 AI 身份并疑似存客户凭据而封禁其购物。→ A2 补充依据见上；结论：完整浏览器交易能力的瓶颈不止在我们这边，官方同困——A2 🟡 维持，且反爬对抗不应成为我们的投入方向（红线：不做绕过反爬的伪装）。
- **身份自报为行业新规则苗头**：Amazon 封禁理由「未表明 AI 身份 + 存凭据」——与我们 F2（凭据不进上下文）、发信审批卡（显式表明代理身份并留痕）的设计方向一致，记为未来交互纪律：对外操作应显式表明代理身份。

## J3. Muse Spark 底层模型细节（2026-10-11 对标审查补录）

来源：[Silicon Republic（2026-04-09）](https://www.siliconrepublic.com/machines/metas-superintelligence-labs-debuts-first-product-muse-spark)。Today.app 仍 1.21.3（基线一致）。

- **底层模型家族首次成形**：Muse Spark 是 Meta Superintelligence Labs 首个产品、Muse 模型家族第一款，多模态，宣称性能对标 GPT-5.4 / Opus 4.6 / Gemini 3.1 Pro，将铺进 WhatsApp/Facebook/Instagram/AI 眼镜。→ 官方 agent 能力由专用模型承载，非通用底座微调。
- **E3「分寸感」对标补充**：官方宣传与 1000+ 医生共建训练数据保证健康问答「factual and comprehensive」（对比 OpenAI Health 的 260 位），并在生物/化学武器等高危领域展示「strong refusal behaviour」。→ 印证 E3 ❌ 的判断：分寸感与安全拒绝是训练数据垒出来的内生能力，我们只能用 prompt 约束逼近；医生共建数据这条路线无法复制，维持 ❌ 并记为长期差距标尺。
- **F5 对标补充**：官方把「网络安全自主威胁能力不足」作为模型安全评估结论对外披露——官方有专门 red-team 评估体系；我们无分类器、无专门评估，F5 🟡 维持。

## J5. iPad 版与装机量（2026-10-13 对标审查补录）

来源：[Mashable（2026-10-08）](https://mashable.com/tech/meta-muse-ipad-ai-agent-business-tools)（转述 Meta 10-07 Threads 官宣与 App Store 更新说明）、[Meta 官方小企业公告（2026-09-29）](https://about.fb.com/news/2026/09/introducing-muse-small-business/)。Today.app 仍 1.21.3（基线一致，2026-10-13 实查）。

- **iPad 版上线（G 节结论不变）**：Muse 10-07 官宣登陆 iPad，9-8 移动端首发后一个月内完成第二设备形态。→ 入口扩张继续不跟进。
- **装机量破 660 万**：Muse 累计安装量估算超 6.6 million。→ 仅记为市场信号，不改变能力对标。
- **小企业连接器名单精确化（H1 复核）**：App Store 更新说明列出 Asana、Canva、Dropbox、Figma、QuickBooks、GitHub、Klaviyo、Zoom、Meta 广告账户，另加 Granola 与 Notion。→ H1 ❌ 维持：名单与 10-08 已录一致，结论不变；官方还宣称用户可给业务目标让 Muse 规划营销内容、做客户提案、建产品页（需用户批准）。
- **零售伙伴扩张（F6 对标补充）**：Connect 宣布新增 Best Buy、Gap、Sephora、Walmart、Wayfair 等零售伙伴。→ 官方代购路径继续铺宽；F6 ❌ 维持（本机未接真实交易）。
- **代理身份开放标准（J4 后续）**：Meta 称正与行业伙伴制定让个人代理向企业表明身份的开放标准。→ 印证 J4「身份自报」纪律；本机发信审批卡已显式表明代理身份，方向一致。

## J6. Muse Wonder frontier 模型与开源 Glimmer（2026-10-15 对标审查补录）

来源：[TechCrunch（2026-10-12）](https://techcrunch.com/2026/10/12/meta-releases-its-first-frontier-model-muse-wonder/)、[Fast Company Brasil 转述 Meta 官方博客（2026-10-14）](https://fastcompanybrasil.com/ia/muse-wonder-nova-ia-meta-faz-competir-modelos-avancados/)（官方原文 research.meta.ai/blog/muse-wonder 本环境未抓到，能力细节为转述）、[IT之家（2026-10-08）](https://www.ithome.com/1/010/310.htm)、[Fast Company Brasil（2026-10-08）](https://fastcompanybrasil.com/ia/muse-glimmer-nova-aposta-meta-ia-codigo-aberto/)、[Fortune（2026-10-13，未核全文）](https://fortune.com/2026/10/13/metas-muse-models-reach-the-ai-frontier-and-kill-any-hopes-to-pace-it/)、[FT（2026-10-13，转述）](https://www.ft.com/content/fca23e77-be57-4d7e-ae61-74ff299e25cb)、[Artificial Analysis（2026-10-12，未核全文）](https://artificialanalysis.ai/articles/muse-wonder)、[IT之家（2026-10-09，未核全文）](https://www.ithome.com/1/010/754.htm)。Today.app 仍 1.21.3（基线一致，2026-10-15 实查）。

- **底层模型换代（J3 升级）**：10-12 发布 Muse Wonder / Wonder Full，官方称首个 frontier 级模型；Wonder 走 Meta Model API 与 Muse Code（$4/百万输入、$20/百万输出 token），Wonder Full 不走 API、仅 Muse Code 订阅者可用，将逐步供给 Muse 订阅用户——agent 底座随之换血；Artificial Analysis 实测智能指数 52/56（上代 Spark 1.3 为 48），1M 上下文，输入文本/图像/视频/音频。→ J3「专用模型承载 agent 能力」继续成立且标尺上移。
- **Active Memory / Active Focus（对标 E1/B1/C5）**：官方称 Wonder 内建 Active Memory（跨会话保存相关信息、召回上下文与用户偏好）与 Active Focus（多步任务规划、遇阻换法、纠错、必要时刻主动追问澄清）。→ E1/B1 已 ✅：官方把这两件事从产品机制下沉为模型内建能力，方向互证；「主动追问」记为 C3/C5 官方参照细节（转述，待官方原文复核）。
- **编程与数字环境操作（A1 官方同构）**：宣称可从小 app 做到复杂软件、跨文件修改并验证结果、操作工具与数字环境、分析文档/理解合同/整理财务信息。→ A1 ✅ 的「自己写代码构建工具」被官方做成模型级卖点，无行动项。
- **安全口径（F5 对照标尺）**：模型带防隐私不当共享与减少危险用途的保护，但完整安全评估报告后发。→ 官方同样先发模型后补安全报告；F5 🟡 维持，不拿官方节奏当放松理由——我们缺口仍在专门分类器与 red-team 评估。
- **订阅三档（补 J2 商业模式）**：免费 + $20/月 + $100/月；Vals 评 Wonder 居网络安全基准第一（Fortune 转述）。→ 与「按交易抽成」并行：订阅是底座、抽成走交易路径，J2 结论不变。
- **拒绝减速与安全延期（Zuck FT 专访，转述）**：拒绝行业「pacing the frontier」协调减速，称 Meta 曾为安全把 Muse 推迟数月才发。→ 对照标尺，无行动项。
- **窗外漏录一：Windows 原生应用（10-08，G 节结论不变）**：微软 Surface 发布会宣布 Muse 以原生应用登陆 Windows 并集成 MXC SDK。→ 入口扩张再添一端，继续不跟进。
- **窗外漏录二：开源 Muse Glimmer（新观察项）**：30B 参数、Apache 2.0 开放权重、面向本地 agent 场景，单消费级 GPU 可在 Mac/PC 本地跑，权重已上 Hugging Face（将支持 Ollama/LM Studio/llama.cpp）；跨长过程维持计划、故障自修、文本+图像输入、100+ 语言、推理档位可调（FC Brasil 10-08 报道，引官方博客 introducing-muse-glimmer-open-agentic-model 与 Reuters 2026-08-10 链接，首发日期待核）。→ 官方开了「本地可跑 agent 底座」先例，与我们全本机路线同向；未来 gate/reflect 若需本地小模型做分类，此为候选（仅记录，不启动）。
- **窗外漏录三：首席 AI 官访谈（10-09，补 J2/E1）**：Alexandr Wang（IT之家误译「汪滔」）称记忆是持续改进重点、购物/省钱/赚钱类交易可抽费、已有订阅档位、暂不考虑广告。→ 与 J2/J6 商业口径一致；「记忆是重点」与我们 E1/E4 已 ✅ 方向互证。
- **待核线索（标题级信源，沿用 I5 先例）**：Muse Voice Transcribe 实时会议转写、Meta One 订阅计划、Muse 新功能 beta 邀测（FC Brasil 相关文章标题，未读全文）——**已于 J7 落账（2026-10-17）**。

## J7. Voice Transcribe 落账 + Spark Open×Apple + Wonder 隐私细则（2026-10-17 对标审查补录）

来源：[DigitalToday 转 Muse Voice Transcribe（2026-10-03 发）](https://www.digitaltoday.co.kr/en/view/99692/meta-unveils-real-time-speech-recognition-model-muse-voice-transcribe)（官方原文 research.meta.ai/blog/introducing-muse-voice-transcribe 本环境两次抓取失败，细节为转述）、[DigitalToday×WSJ：Muse Spark Open 跑上 Mac（2026-10-16）](https://www.digitaltoday.co.kr/en/view/115317/meta-teams-up-with-apple-on-local-ai-as-muse-spark-open-runs-on-macs)、[IT168（2026-10-16，转述 VentureBeat）](https://cloud.it168.com/a2026/1016/6953/000006953766.shtml)、[TechCrunch Meta One（2026-09-15，全文未核）](https://techcrunch.com/2026/09/15/meta-expands-subscription-push-with-new-ai-focused-plans/)、[TechCrunch early access（2026-09-25，全文未核）](https://techcrunch.com/2026/09/25/meta-opens-early-access-program-for-new-muse-features/)。Today.app 仍 1.21.3（基线一致，2026-10-17 实查）。

- **J6 待核线索落账①：Muse Voice Transcribe 坐实（对标 rtc-transcriber，G 节结论不变）**：MSL 首个实时语音识别模型（9-1 发布），Muse Spark 家族自回归多模态模型，单模型同时做实时转写+说话人分离+语句结束检测；80ms 单位处理、自适应延迟（按词难度决定继续听还是立即出字）；Artificial Analysis 流式评测第一（WER 3.1%）；70+ 语言训练、25 种深度校验（含中英日韩），原生 code-switching；支持预置语言/关键词/上下文提升准确率；1h+ 音频、20+ 说话人免后处理；定价 $0.18/小时音频（$3/千分钟）；已上 Meta Model API / Meta AI for Mac / Muse Code，Mac 上按住 Fn 即系统级语音输入。→ 本机 rtc-transcriber 是同场景（会议转写），官方把它做成模型级能力+系统级入口；「关键词/上下文预置」记为可借鉴的转写质量手段（仅记录）。
- **J6 待核线索落账②：Muse Spark Open×Apple（J6 窗外漏录二升级）**：Meta 发布第二个开放权重模型 Muse Spark Open，Apple 更新 MLX 工具使其顺畅跑在 Mac 上（WSJ 10-15），MLX 可把 AI 负载分摊到多台互联 Mac；官方推荐本机配置两台 M5 Ultra Mac Studio（各 512GB 统一内存），实际需 1TB+ 内存（约 $40k+，WSJ 称比月租数千美元的云算力更划算）；Wang：「世界相当一部分将跑在开放模型上」。→ Apple 官方背书 Mac 本地推理，与 Glimmer 同向且更重磅；但 1TB 内存门槛决定它不是本机 gate/reflect 分类候选——Glimmer 30B 仍是唯一候选。
- **Wonder 访问与隐私细则补充（J6 升级，I4/F4 对标）**：两款 Wonder 均不提供公开下载/自行托管（告别 Llama 开放权重时代）；Muse Code 订阅默认开启「贡献者模式」（提交内容用于训练未来模型，可关闭），标准 API 不用于训练——与 J 节「Muse app 数据默认用于训练」口径一致，**默认开启**是行业反向标尺，强化 I4（我们零上传、无训练用途）；Wonder Full 走 Muse Code 订阅 $50/$200 两档（J6 的免费+$20+$100 是 Muse app 订阅，两条订阅线并存）；API 缓存输入有折扣；模型设计为「执行重要操作前主动求确认」——与 D4 审批卡/F4 授权模型官方同构，无行动项；完整安全评估报告仍未发（F5 对照标尺不变）。
- **J6 待核线索落账③：Meta One 与 beta 邀测名称坐实（均标题级）**：Meta One 为订阅计划名称（TechCrunch 9-15；Nasdaq 分析师文称早期数据积极，标题级）；beta 邀测 = Muse 新功能 early access 计划（TechCrunch 9-25）。两条只落账名称与日期，能力细节待全文。
- **新待核线索（标题级，沿用 I5 先例）**：Muse 应用不在欧洲推出（[notebookcheck-cn](https://www.notebookcheck-cn.com/Meta-Muse-Wonder-Muse.1423057.0.html)，监管侧信号）；Muse 覆盖七个推理平台（[gurufocus](https://www.gurufocus.com/news/9127778/meta-stocks-slip-although-muse-reaches-seven-inference-platforms)，市场信号）——留待下次审查。

✅ 24 项 ｜ 🟡 5 项 ｜ ❌ 4 项（2026-10-17 复核：计数维持 10-15 重算不变，本轮纯对标事实补录、无勾选变化；git HEAD 即上轮 J6 提交，其后无新实现提交，无「已实现未打勾」项）

**下一批最短路径**（按性价比）：
1. C5 多目标节奏 + 建目标自动配日程（小）
2. B3 记忆生命周期：定期归档/合并/淘汰（中）
3. C2 Gmail OAuth/日历 source（中，需用户授权配合）
4. F3 统一出站强制层（中，接真实邮箱前应完成）
5. E2 形象个性体系（小，纯记忆段约定）
6. A3 Artifacts（大，独立项目级）
