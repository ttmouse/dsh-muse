# 主对话轮换手册（Master Session Rotation）

> 背景：主对话持续累积上下文（goal 轮次、任务卡、文件编辑记录），UI 清理不减少底层 token。定期换新对话是正确做法。**所有重要状态都在对话外的持久层，换对话零数据丢失。**

## 自动迁移（无需操作）

| 状态 | 载体 | 说明 |
|---|---|---|
| 全局记忆（lessons/preferences/关键人/目标观） | ~/.dsh/memories/main.md | 新会话自动注入 |
| 项目记忆 | ~/.dsh/memories/projects/ | 新会话自动注入 |
| 目标池（4 个长期目标） | ~/.dsh/muse/goal-pool.json | 随时可读 |
| 关键人注册表 | ~/.dsh/muse/key-people.json + 记忆 | 已入记忆 |
| Muse 身份 | ~/.dsh/muse/identity.json | 自动注入 |
| launchd 静默层（gate/reflect/分诊/巡查/复盘触发） | 正本在本仓库 examples/*.plist（gate / ops-warden-trigger / message-triage / stall-patrol，rotate-master 每日 08:00 自动重指四 plist）；reflect 与 memory-maintenance 仍在 ~/Library/LaunchAgents | 与对话无关，继续跑 |

## 需要在新对话重建（约 5 分钟）

### 1. 恢复目标模式（1 句话）
新对话里说：**「继续」+ 简述目标**（例如「继续打磨 dsh-muse，目标池在 ~/.dsh/muse/goal-pool.json」）。
keeper 会武装目标；把 goal-pool.json 的 armed 目标贴给它确认即可。

### 2. 重建 4 个调度（各 1 次 schedule_create）
- **9:30 每日对标审查**：web_search Muse 新细节 + Today.app 版本监测 + 清单核对（prompt 见旧对话或按 docs/capability-checklist.md 语义重建）
- **20:35 每日项目总结**：三源管线（node examples/daily-summary-sources.mjs + ec review + 记忆增量 → ev_add_md 写入当日笔记）
- **周日 20:10 每周摘要**：node examples/weekly-digest.mjs --note
- **周日 21:00 每周元复盘·元认知层**：对本周复盘体系本身做复盘（复盘质量/漏报/目标差异/自动化清单增删改/复盘逻辑五问；每周恰好一张卡，含自指降频条款）——prompt 正本见 docs/master-session-rotation.md 附录 D（2026-10-07 上线）

### 3. 更新触发器指向（4 个 plist，各 1 行；rotate-master 每日 08:00 已自动覆盖，手动轮换时才需照做）
- examples/ops-warden-trigger.plist 的 MUSE_SESSION_ID 改为新会话 id，然后：
`launchctl bootout gui/$(id -u)/com.dsh-muse.ops-warden-trigger; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/ops-warden-trigger.plist`
- examples/message-triage.plist 的 MUSE_SESSION_ID 同样改新 id 并重载：
`launchctl bootout gui/$(id -u)/com.dsh-muse.message-triage; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/message-triage.plist`
- examples/stall-patrol.plist 同样改新 id 并重载（断线对话巡查，每小时一拍；rotate-master 已纳入重指清单，2026-10-07 上线）：
`launchctl bootout gui/$(id -u)/com.dsh-muse.stall-patrol; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/stall-patrol.plist`
- examples/gate.plist 的 --session 参数同样改新 id 并重载（gate 信号注入主会话；2026-10-07 入库并纳入轮换清单——此前装在 ~/Library/LaunchAgents 的旧正本跨两次轮换漏指，日历类信号投进无人读的旧会话，实证见 retro 日常复盘记录 2026-10-07 21:3x 条）：
`launchctl bootout gui/$(id -u)/com.dsh-muse.gate; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/gate.plist`
（漏改则 A 类注入打向旧会话，旧会话关闭后静默失败；2026-10-07 分诊复核补记。另：StartCalendarInterval 注册会失效——重载即修，2026-10-07 实证：分诊任务加载后 runs=0 三次日历点未触发，bootout+bootstrap 后注册恢复，另用临时探针证明当日历投递本身正常。）

### 4. 重生 ops-warden 成员（1 句话）
对新 Muse 说：「重建 ops-warden 常驻运维成员」（charter 正本：~/.dsh/muse/ops-warden-charter.md，spawn prompt 直接用其正文；2026-10-07 修正——原指向 retro 文档「成员模板节」不存在）。

## 旧对话的处置

- **保留不删**：它是完整的工作档案（100+ 轮、全部任务卡、调试历史）
- ops-warden 旧实例随父会话休眠，不再被触发（plist 已改指新会话）
- 旧调度核验：用 `callRpc(MUSE_URL,'schedule/list',{sessionId:旧id})` 查旧会话调度数（2026-10-07 轮换实测：会话关闭后为 0，无双跑）；为 0 则无需再让旧对话删（示例探针见 examples/lib/dsh-client.mjs 的 callRpc）

## 轮换节奏建议

- 触发信号：上下文感觉「变笨」（遗忘早前决定、重复已修问题）或 UI 显示 token 压力
- 建议频率：**每周一次**（周一早上换新，配合周报正好闭环）

## 附录：3 个调度的完整 prompt（新对话照抄重建）

### A. 每日对标审查（cron: 30 9 * * *，Asia/Shanghai）
```
【每日 Muse 对标审查】对 /Users/douba/Projects/dsh-muse/docs/capability-checklist.md 做例行维护：
1) web_search 查询 Meta Muse 官方新披露的能力细节，有新细节补进清单（注明来源）；
2) 本机对标应用监测：检查 /Applications/Today.app 的版本（Info.plist CFBundleShortVersionString，基线 1.21.3）是否更新；
3) 核对清单：对照 git log 近期提交，把已实现但未打勾的项改为 ✅（附证据），核对 🟡/❌ 是否仍准确；
4) 有变化才更新文档并 commit+push，无变化静默。不改代码、不做重构。
```

### B. 每日项目总结（cron: 35 20 * * *）
```
【每日项目总结】执行每日总结管线：
1) node /Users/douba/Projects/dsh-muse/examples/daily-summary-sources.mjs --date 今天
2) ec review --since 1d --limit 200
3) 读 ~/.dsh/memories/main.md 与项目记忆中今日新增条目
4) Markdown 起草（git 提交/聊天复盘/记忆增量/阻塞与决策各节，真实出处不编造），用
   python3 ~/.agents/skills/note-cli/scripts/ev_add_md.py <临时md> --date 今天 --key daily-summary-<日期>-vN
   写入当日日记（--date 报错就改 --under 今天日记已有节点）
5) ev get 读回核对
6) demo-journal.md 记一行「每日总结：已写入笔记」。有需用户知道的事项一句话汇报，否则静默。
```

### C. 每周摘要（cron: 10 20 * * 0，周日）
```
【每周摘要】运行 node /Users/douba/Projects/dsh-muse/examples/weekly-digest.mjs --note 生成周报并写入 Evergreen 笔记
（写入失败就用输出内容手动起草经 ev_add_md 写入）。完成后 demo-journal.md 记一行「周报已生成」。
有需用户关注的周度发现一句话汇报，否则静默。
```

### D. 每周元复盘·元认知层（cron: 0 21 * * 0，周日，2026-10-07 上线）
```
【每周元复盘·元认知层】对本周的复盘体系本身做复盘（周日 21:00，每周恰好一张卡）。

一、输入（全部要读，给证据不给印象）：
1) docs/evolution/rounds/2026-10-06-agent-team-retro.md「日常复盘记录」本周条目
2) demo-journal.md 本周条目
3) docs/evolution/state.json——candidates 健康：waiting 老化多久？accepted 缺用户评价的有哪些？
4) ~/.dsh/muse/goal-pool.json——armed 推进 vs「这就是 Muse」体感目标的差距；queued 目标饥饿了多久
5) 本周用户原话反馈（journal/聊天里的「不对劲」类信号——最高价值的迭代信号）

二、五问：
1. 复盘质量：本周各复盘发现了什么真问题？有没有「说修好了实际没修好」或验证盲区（先例：10-07 gate 注入漂移，「端到端验证✅」实为止步受理层）？
2. 漏报：本周用户自己发现了什么而复盘没发现（先例：卡片刷屏由用户截图发现）？为什么漏？复盘的维度/频率/深度怎么补？
3. 目标差异：armed 推进对齐体感目标吗？queued 饥饿目标该轮转、砍掉还是拆分？
4. 自动化清单增删改：7 个 launchd + 4 个 schedule，每个的实际产出被谁消费？零消费的降频或移除；仍在手动做的该自动化吗？
5. 复盘逻辑本身要不要改？

三、产出：
1. 追加 docs/evolution/rounds/ 下当周 meta-retro 周文档
2. 小问题直接修+commit；大的优化点入 state.json candidates
3. 给用户恰好一张卡：本周元发现 top3 + 需要拍板的事项；确实无实质发现则一张说明卡写明「本周复盘体系无盲区证据」
4. 自指条款：若连续两周本任务产不出有价值发现，在卡上自我提议降频为双周或取消

不改任何每日节拍；不创建新自动化（除非五问结论支持）。
```

### 切换顺序（避免双跑或空窗）
1. 新对话：照抄 A/B/C/D 创建 4 个调度
2. 新对话：更新 examples/ops-warden-trigger.plist 的 MUSE_SESSION_ID → 新会话 id，bootstrap 重载
3. 旧对话：让旧 Muse 执行 schedule_delete 删除旧调度（schedule_list 拿 id）
4. 验证：次日 9:05/9:30/20:35 的卡片出现在新对话
