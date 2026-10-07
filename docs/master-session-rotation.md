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
| launchd 静默层（gate/reflect/分诊/复盘触发） | ~/Library/LaunchAgents/com.dsh-muse.* | 与对话无关，继续跑（例外见下：分诊/ops-warden 的会话指向需按 §3 重指） |

## 需要在新对话重建（约 5 分钟）

### 1. 恢复目标模式（1 句话）
新对话里说：**「继续」+ 简述目标**（例如「继续打磨 dsh-muse，目标池在 ~/.dsh/muse/goal-pool.json」）。
keeper 会武装目标；把 goal-pool.json 的 armed 目标贴给它确认即可。

### 2. 重建 3 个每日调度（各 1 次 schedule_create）
- **9:30 每日对标审查**：web_search Muse 新细节 + Today.app 版本监测 + 清单核对（prompt 见旧对话或按 docs/capability-checklist.md 语义重建）
- **20:35 每日项目总结**：三源管线（node examples/daily-summary-sources.mjs + ec review + 记忆增量 → ev_add_md 写入当日笔记）
- **周日 20:10 每周摘要**：node examples/weekly-digest.mjs --note

### 3. 更新触发器指向（3 个 plist，各 1 行）
- examples/ops-warden-trigger.plist 的 MUSE_SESSION_ID 改为新会话 id，然后：
`launchctl bootout gui/$(id -u)/com.dsh-muse.ops-warden-trigger; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/ops-warden-trigger.plist`
- examples/message-triage.plist 的 MUSE_SESSION_ID 同样改新 id 并重载：
`launchctl bootout gui/$(id -u)/com.dsh-muse.message-triage; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/message-triage.plist`
- examples/stall-patrol.plist 同样改新 id 并重载（断线对话巡查，每小时一拍；rotate-master 已纳入重指清单，2026-10-07 上线）：
`launchctl bootout gui/$(id -u)/com.dsh-muse.stall-patrol; launchctl bootstrap gui/$(id -u) ~/Projects/dsh-muse/examples/stall-patrol.plist`
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

### 切换顺序（避免双跑或空窗）
1. 新对话：照抄 A/B/C 创建 3 个调度
2. 新对话：更新 examples/ops-warden-trigger.plist 的 MUSE_SESSION_ID → 新会话 id，bootstrap 重载
3. 旧对话：让旧 Muse 执行 schedule_delete 删除 A/B/C 三个旧调度（schedule_list 拿 id）
4. 验证：次日 9:05/9:30/20:35 的卡片出现在新对话
