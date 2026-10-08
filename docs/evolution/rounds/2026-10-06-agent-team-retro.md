# Agent Teams 化改造：并行测试复盘 + 迭代优化（2026-10-06）

应主控指示：「按智能体团队方式改造，测试后复盘，找迭代优化空间」。本文是首个**多成员并行批**的完整复盘。

## 一、测试设计

3 个独立文档任务并行派遣给 3 个成员（各自独立会话、写入范围互不重叠）：

| 任务 | 成员 | 交付 |
|---|---|---|
| task-2 gate README 同步 | gate-docs-sync | +12 行（watchdog/超时策略/元数据化） |
| task-3 orchestrator README agent-team 章节 | orch-playbook | +31 行（三模式对比/分工纪律/实战流程） |
| task-4 checklist H 类评估 | checklist-evaluator | +1 行评估结论 |

## 二、吞吐实测（git 时间戳）

| 时间点 | 事件 |
|---|---|
| 13:44:04 | 3 任务上板 + 3 成员创建（t0） |
| 13:44:26 | 首个交付（checklist，t0+22s） |
| 13:44:41 | 第二交付（orchestrator，t0+37s） |
| 13:44:46 | 第三交付（gate README，t0+42s） |

**3 任务全部交付：42 秒**。对照：主控串行做同样工作 ≈ 3 轮 × 数分钟 ≈ 10-15 分钟。**并行收益 ≈ 15-20×**。

## 三、什么有效（证据）

1. **写入范围纪律满分**：三个成员各自只改动声明的那一个文件（git --stat 核实），无越界
2. **CAS 防冲突生效**：task-1 时 lead 的重复 complete 被修订号挡下；成员认领串行正确
3. **成员自治闭环**：认领 → 独立工作 → 自行 commit（规范前缀）→ 汇报 → 自标完成，全程无主控干预
4. **质量达标**：gate README 三处变化均先对照代码核实再写；orchestrator 章节含 Muse 不变量（自治授权边界）——成员没有为省事越线

## 四、摩擦点（如实）

1. **首批代码任务（task-1）成员不自信提交**：留 uncommitted 让 lead 处置——文档任务（task-2/3/4）则自行规范提交了。差异来自任务卡是否明确「自行 commit」——**任务合同模板需固化这条**
2. **lead 验证是串行瓶颈**：3 个提交逐一审查（范围/质量）仍是主控单点。成员越多，验证越成为瓶颈
3. **等待模式笨重**：lead 用重复 wait_agent 轮询收口；应改通知驱动的收口流程
4. **脏状态传染**：reflect-decisions.log 的运行时改动让两个成员在汇报里专门澄清「不是我改的」——运行时产物该彻底移出成员视野（.gitignore 已做，但历史脏状态仍在工作树出现过）

## 五、迭代优化清单（按优先级）

| # | 优化 | 类型 |
|---|---|---|
| O-a | **任务合同模板**固化：目标/唯一写范围/完成标准/自行 commit 要求/汇报格式——拷贝即用 | 流程 |
| O-b | **lead 验证清单**按任务类型模板化（docs：范围+准确性；code：测试全绿+范围+不变量） | 流程 |
| O-c | 常驻**夜班成员**替代部分 detached headless：需要 LLM 判断的夜间工作（语料复核/深度审校）由成员承担，产出走任务板 | 架构 |
| O-d | 成员粒度经济性：每个成员是完整模型会话——**只对 ≥5 分钟等效工作量的任务派成员**，琐碎改动主控自己做 | 成本 |
| O-e | 收口改通知驱动：成员完成消息触发 lead 验证，替代轮询等待 | 流程 |
| O-f | 账本整合点：成员结论由 lead 统一写入 state.json（本次已遵守——无人碰账本） | 保持 |

## 六、结论

- **B06 主控编排定案**：官方 agent-team 为并行工作基座（本批 + task-1 O2 修复为双重证据），B06 转 accepted
- 3 并行成员、42 秒交付、零越界、零账本污染——**改造测试通过**
- 下一步：O-a/O-b 模板化（下一轮），夜班成员试点（O-c，本周）

## 日常复盘记录

- [2026-10-06 16:25 +08:00] ops-warden 首次日常复盘：launchd 四任务（gate/reflect/message-triage/memory-maintenance）exit 0 全部在册；patrol 约 30 分钟一拍持续运行（最近 2026-10-06T16:01+08），24h 内 1 次命中（07:31）其余 0 命中，无异常。gate/reflect 决策日志停留在 10-05 凌晨（demo 流无新触发），属预期静默非失效。
- [2026-10-06 21:35 +08:00] 晚间机制复盘：①节奏——patrol 30 分钟节拍健康（最近 21:20+08），launchd 五任务全 exit 0（含新增 ops-warden-trigger）；memory-maintenance 每周日 4:00 尚未到首次触发，正常。②质量——白班成员复核抓出 triage 四 bug（0a85460）、桌面 muse link 修复、规则门禁/关键人扩容/目标池上线按计划推进，无返工。③停滞——gate/reflect demo 决策日志仍停在 10-04（无触发静默，预期）；patrol 24h 命中 1 次，无漂移。④异常——「triage 重复注入」lesson 在项目记忆被重复追加 4 次（08:26-09:26 复现计数递增），属记忆卫生问题，已合并为一条（脚本侧去重已修，gate 端持久化已见集合列为后续加固方向）。无 A 类，未报 lead。
- [2026-10-07 21:37 +08:00] ops-warden 每日机制复盘（轮换日 21:30）：①节奏——7 个 launchd 任务全 exit 0；message-triage 08:00/08:30/09:00 三发全中（昨夜重载修复坐实）；stall-patrol 30 分钟节拍健康（最近 21:14），0 新僵柜；20:35 每日总结 20:37 正常落笔；9:30 对标审查因 c3b05438 混乱期误清漏跑一次、17:21 已补跑，明日恢复。②质量——stall-patrol 首日闭环（分类纯函数+8 用例，测试当场抓真 bug）；毒丸加固入库（47f2c6c）；goal 轮 12/12 预算耗尽静默收场。③停滞——stall-patrol 3 候选均在去重窗（旧主对话 blocked 等用户发话；不重复调查，同 journal 17:11 定案）；reflect 决策日志静默属预期（/tmp 日志证实「无新输入不调模型」路径健康）。④异常（A 类，已修）——**gate 注入目标跨轮换漂移**：gate 的 --session 自 10-5 起固定指旧会话 2d91d053（已闲置 ~29h），主控已轮换两次而 rotate-master 重指清单只有 repo 侧三 plist，gate 装在 ~/Library/LaunchAgents 漏网——日历类 judge SAY 信号（10-6 两次）全投进无人读的会话队列；今晨 12:00 的「端到端验证」结论实际止步于 RPC 受理层，未到主会话，验证存在盲区。修复：gate 正本入库 examples/gate.plist（指现任主控 da8579be，原 LaunchAgents 文件留 .bak）+ bootout/bootstrap 重载（launchctl print 实证 path=repo、session=da8579be）+ rotate-master 重指清单 3→4 + muse-status 漂移检查覆盖 gate.plist（--session 参数形态）并修 gate 决策日志路径（已迁仓库根）+ 手册自动迁移表同步。验证点：明早 08:00 rotate-master 首跑自动重指四 plist。遗留（需用户行动）：gate 后台运行下日历读取持续超时（jxa-calendar ETIMEDOUT，日志自证「需在系统设置重新授予日历自动化权限」，TCC 弹窗无法在后台 launchd 上下文出现）——前台手动跑 gate 正常，仅后台日历信号缺失，待用户重新授权后自愈。
- [2026-10-08 09:11 +0800] ops-warden 分诊复核（9:05 触发）＋机制异常：①分诊——最近 24h 无漏报 A 类：钉钉 @我 近两日 0 条；微信 60 条未读中真人私聊 0 条（唯一「私聊」为公众号容器 brandservicesessionholder）；四位关键人（老婆/轮子/菜花/青山）时间线末条均为本人发出或对方已收尾（10-06 及更早），无待回复；/tmp/dsh-muse-triage.log 0 字节、message-triage runs=2 exit 0（08:30/09:00 静默路径）。②异常（A 类，已修）——**reflect 注入目标跨轮换漂移**：reflect 装在 ~/Library/LaunchAgents 且不在 rotate-master 重指清单，其 --session 自 10-5 起固定指旧会话 2d91d053（会话列表实证 running=false、闲置约 40h），反思循环产出的提议（[muse-idea]）会投进无人读的会话，与昨日 gate 同因漏网；近期日志为「无新输入不调模型」故影响尚未显性。修复：reflect 正本入库 examples/reflect.plist（指现任主控 95f6c055）+ bootout/bootstrap（launchctl print 实证 path=repo、session=95f6c055、runs=1 exit 0）+ 旧正本留 .pre-reflect-rotation.bak + rotate-master 重指清单 4→5 + muse-status 漂移检查补 reflect + 手册第 3 节/自动迁移表同步；顺带把 ~/Library 里残留的 gate 旧副本（仍指 2d91d053，登录时若被自动加载会回退）重指现任主控。验证：muse-status 五个会话相关 plist 全一致、7 任务全 exit 0。③遗留（需用户行动，昨日已报，不重复打扰）：gate 后台日历 TCC 授权失效（日志持续 jxa-calendar 超时），需系统设置重新授予。
- [2026-10-09 00:19 +0800] ops-warden 每日机制复盘（21:30 触发，会话中断后于次日 00:2x 补完）：①节奏——8 个 launchd 任务全 exit 0（gate 25 / reflect 25 / restart-recover 16→34 / stall-patrol 13 / message-triage 7 / rotate-master 2 / ops-warden-trigger 2 / memory-maintenance 0=周日 4:00 未到期）；stall-patrol 今日 28 拍、中位间隔 30.2 分钟，节拍健康；rotate-master 08:00 首跑把 5 个会话相关 plist（含当晨刚入库的 reflect）一次重指到位，无需人工补。②质量——stall-patrol 15:04 上线的长压制窗当日下午起全部走「去重窗内已报过」静默，同一 blocked-goal 不再一天四报；restart-recover 两次重启各上报一次（8 条 / 3 条）后转入静默，符合设计；reflect 决策日志 08:00–16:44 连续 25 拍为「无新输入不调模型」预期静默，16:46 后恢复产出；gate 决策日志今日无新条目（无 A 类信号）。③停滞——巡查候选均在长压制窗内（等用户发话），无新增僵柜。④异常（A 类，已修）——**restart-recover 在宿主重启窗口内崩栈**：宿主 20:15 重启后一段时间 19387 不响应，脚本主流程第一处 await（`session/list` 分页普查，restart-recover.mjs:79）撞 15 秒 RPC 超时抛 DOMException，日志连出堆栈、退出码非 0；同批还暴露第二个缺陷——普查成功、投递成功但 `markSeen` 未落地（日志「已上报 3 个」而 state 里 reported=0），后果是同一批中断对话下一拍重复上报、7 天长压制窗失效。修复（两处，均带验证）：①普查分页整块加 try/catch，取不到列表即打一行「宿主未就绪，本拍跳过」并 exit 0；空列表同样跳过——不写状态、不记账，10 分钟后自然重试；②记账与交付解耦：`markSeenMany` 一次批量写盘且**永不抛错**（失败只退化为「这一轮没记住」并记 stderr），投递失败则本拍不记账、下一拍重试（避免中断对话被静默吞掉），报告落盘一律容错。证据：同一条「宿主不可达」命令，修复前退出码 1 + DOMException 堆栈，修复后退出码 0 + 一行「宿主未就绪，本拍跳过（fetch failed）」；真机 kickstart 一拍 exit 0、日志无堆栈。回归：test:timers 35/35 绿（新增 4 条——批量记账、超批量不截断、写盘失败不抛错、普查防线契约），restart-recover 12/12，vitest 63/63。
