# R-B06-orchestrator · 单会话多目标编排样例

- 日期 / 检查时刻：2026-10-05 Asia/Shanghai
- 候选：B06 → waiting
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

## 结果与边界审计

- `examples/orchestrator/README.md` 与固定输入 dry-run 示例已交付；detached headless 进程并行完成文档清单合同的记录在 `docs/evolution/rounds/2026-10-05-worker-serialization.md`。这证明进程可以并行，不证明跨 worker 的 DSH 授权安全或单会话体验成立。
- 审计发现旧 `spawn-worker.mjs` 以 `session/create` + `session/prompt` 派发。`docs/timer-first.md` 明确禁止自动生产者用 `session/prompt` 伪装人类来源。因此已将脚本改为只格式化合同，`dispatched:false`，不创建会话、不发送提示。
- `pnpm evolution:status`（2026-10-05 13:16 Asia/Shanghai）显示 B01 仍 waiting，E1 直接触发、24h 观察与用户评价均缺失；Codex 轮次不能替代 DSH 主会话人类触发。
- 判定：inconclusive。编排合同与操作系统级并行证据存在，但当前没有已证明的、保留来源身份的 DSH worker 派发接口；真实单会话多目标体验及用户体感仍 unknown。B06 转为 waiting。
- 解除条件：找到并验证 host-attested 的非人类 worker 消息入口，且 worker 的工具/文件边界能被强制；或由用户在 DSH 主会话直接触发一个明确授权的端到端试运行。不得用 `session/prompt` 或 Codex 授权代替。
- 下一步：等待上述条件；继续使用主会话已授权执行者做独立工作，不创建自动派发器。
