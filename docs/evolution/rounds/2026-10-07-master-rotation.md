# 主对话轮换首日：自动轮换补全 + 成员路由闭环 + 一次幂等失效事故（2026-10-07）

## 假设

「所有重要状态都在对话外持久层」能支撑主对话零丢失换新（rotate-master 每日 08:00 自动轮换）。首日实战检验该假设，预期暴露轮换链路的真实缺口。

## 改动

- `examples/rotate-master.mjs` 补「卸任会话私有调度清理」（schedule/list → 逐条 schedule/delete）——交接遗留项：不删则卸任主控的 3 条每日调度与新会话重建的调度跨日双跑。
- 同脚本补 `--dry-run`（只打印计划，零副作用）；交接简报补「按 ~/.dsh/muse/ops-warden-charter.md 重生 ops-warden 成员」指引（否则 plist 重指后路由进无成员会话空转）。
- ops-warden charter 正本落盘 `~/.dsh/muse/ops-warden-charter.md`；`docs/master-session-rotation.md` §4 失效指针（retro 文档「成员模板节」不存在）修正（77660df）。
- 事故回滚产物：误轮换会话 c3b05438 的 3 条残留调度 RPC 删除 + 反指令注入 + state/plist 复位。

## 验证

- schedule RPC 契约三重实测：宿主 typert.host.js 源码 schema（delete 需 `{id, sessionId}` + `request` 键）→ not-found 探针（返回 `deleted:false, code:schedule_not_found`）→ 真删断言 4/4（在册/真删 true/删净/本会话 3 条真实调度无恙）。
- 9:05 launchd 首次真实触发全链路：trigger → 主控一行转交 → 成员会话收口 → journal（09e3aa1）；主对话零轮次达成。
- 08:00 验证点：message-triage runs=3（08:00/08:30/0900 三发全中）exit=0 日志 0 字节（凌晨 04:38 重载修复生效）。
- 幂等失效事故（如实）：04:20 那轮把 master-session.json 的 date 写成 UTC 日期 `2026-10-06`，05:00 一次「dry-run 意图」的执行幂等失效 → 全量轮换提前发生（新建 c3b05438、清空在任主控调度、plist 重指）。回滚后终态断言：本会话调度 3 / c3b05438 调度 0。教训入 lesson 记忆（跑副作用脚本前必须核实状态文件实际值；dry-run 能力要在脚本诞生时有）。

## 局限

- rotate-master 新清理逻辑的完整自动首跑在明日 08:00（今晚可 --dry-run 预检）；今日证据链依赖人工/kickstart 触发路径。
- 幂等护栏对「state 文件被历史 bug 污染」不设防：护栏输入的核验目前靠人（lesson），脚本内未加 state.date 合理性断言（候选改进：date 异常（晚于今天/格式错）即拒绝执行并告警）。
- c3b05438 对反指令的遵守情况未核验（无副作用的会话，留观即可）。
- 并发会话「善意代提交」风险：77660df 把另一会话的工作区未提交编辑顺带卷入 commit，本次结果无害但属运气；轮换窗口期各会话 commit 应只圈自己改的文件。

## 判定

accepted（工程级）：调度清理修复有断言级证据，成员路由链有真实触发证据，事故完整回滚且教训固化。自动轮换端到端大考归明日 08:00 首跑。
