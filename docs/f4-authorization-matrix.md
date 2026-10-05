# F4 授权矩阵 — Muse 五级授权在 dsh-muse 的对应

Muse 的授权形态（官方复盘）：一次性 / 仅限当前会话 / 仅限当前任务 / 有时间限制 / 持续有效。
逐级对照 dsh-muse 现有机制的覆盖情况与证据。

| Muse 授权形态 | dsh-muse 对应 | 覆盖 | 证据 |
|---|---|---|---|
| **持续有效**（standing autonomy） | `muse_autonomy {autonomy:true}` → `muse/intent` 侧车记录（绑定人类消息）→ keeper 跨重启恢复 | ✅ | 桌面重启后记忆注入/keeper 自动恢复（真实重启观察，trial-counting（现为 rounds/2026-10-05-trial-counting.md）E2 行） |
| **限时**（运行 N 次后停止） | `muse_routine {max_runs:N, every_seconds}`——预算耗尽不自动续期，需人类恢复 | ✅ | timer-first.md 合同；tool-muse 测试（预算/暂停/恢复语义） |
| **仅限当前任务** | routine 绑定单一目标做 review；gate 各 source 独立规则 | 🟡 | 单目标绑定已实现；跨任务的细粒度任务级授权未系统化 |
| **一次性**（单次动作授权） | dsh-email `email_send` 每次发信弹审批；interaction 审批卡 | ✅ | dsh-email sendApproval 默认开启（发信确认实测于设计文档） |
| **仅限当前会话** | DSH permission-presets（会话级访问模式） | ✅（宿主原生） | sandbox/mode 事件（workspace-write 等） |
| **暂停/撤销优先** | 手动 disarm > keeper；muse_routine pause/resume 需人类请求；budget 优先 | ✅ | goal blocked/disarmed 机制；timer-first.md「人类暂停、撤销和运行预算始终优先」 |

## 缺口（照实标注）

1. **任务级细粒度授权**：目前授权粒度是「目标级」+「工具级」，没有「单次任务级」的中间层——muse_routine 的 max_runs 实际承担了这个角色，可视为已覆盖大部分需求。
2. **授权的可视化管理页**：权限分散在 intent 侧车、routine 状态、permission-presets 三处——muse-status.sh 已聚合展示，但用户编辑仍需分别操作。

## 红线（F4 的不可变部分）

- 授权**只能**由人类直接 turn 授予/撤销（intent 绑定 humanMessageId，autonomous 来源永不生效）——这是 Muse「资料/模型建议不能授予自治」的同源纪律，已由测试固化（六类拒绝路径）。
- 暂停/撤销后，任何自动来源不得恢复工作（trial-counting（现为 rounds/2026-10-05-trial-counting.md）硬门槛行）。

## 结论

F4 从 🟡 升级条件：任务级授权已被 muse_routine max_runs 实质覆盖；剩余为可视化编辑体验（低优先）。**本项可标记为「系统化使用已达成」**，矩阵本文档即证据。
