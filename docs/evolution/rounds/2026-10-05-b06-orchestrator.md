# R-B06-orchestrator · 单会话多目标编排样例

- 日期 / 检查时刻：2026-10-05 Asia/Shanghai
- 候选：B06 → active
- 执行者：主 Agent 单写；未创建后台 Worker
- 当前授权入口：本轮 Codex 人类请求，仅覆盖仓库内可逆文档和示例；不转移为 DSH 自治授权
- 时间预算：本轮一个交付单元；成本与 token 账本 unknown
- revision：开始时 HEAD `ea350cd`

## 基线与假设

- 基线：`examples/orchestrator/` 不存在；`muse/src/routines.ts` 显示单会话每 tick 只接纳一个 routine work unit，例程间按到期时间选择；routine 创建需当前 turn 的直接人类请求及既有 `muse_autonomy=true`。
- 假设：一个人类可见主会话、多个有独立合同与预算的 workstream、单一到期巡检、无自治权限的 scoped worker 与主控汇总约定，足以给出可执行且不混淆授权的体验近似。
- 通过：交付合同、worker 指令模板、巡检/停止/汇报步骤及可运行示例；示例只读校验并选择一项建议，不调用 DSH、不创建任务、不授予授权。
- 不通过：示例能自行执行、排程或把 worker/idea 提升为授权；或关键边界与源码/`timer-first.md` 冲突。
- 回退：删除新增 `examples/orchestrator/` 目录，恢复本轮 `state.json` 和看板快照。

## 执行中

核对了 `muse/src/routines.ts`、`tool-muse/src/index.ts` 与 `docs/timer-first.md`。结果、命令、证据和局限将在交付后补齐。
