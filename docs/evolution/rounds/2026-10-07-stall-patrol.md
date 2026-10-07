# 主控巡查机制：断线对话的发现与推动（2026-10-07）

## 假设

桌面客户端重启/轮换/中断会让工作会话停转，而恢复只能靠用户逐个发「继续」。若主控每小时用 session/list 全量投影（updatedAt/running/goal/todos/inbox）做断线信号分类，就能自动发现停转对话并推动续跑——用户 2026-10-07 直接授权此机制（「你是主控…帮我发现问题、帮我做推动」）。

## 改动

- `examples/lib/stall-classify.mjs`：分类纯函数。四类信号（blocked-goal/stalled-goal/stalled-inbox/stalled-todos），同 goalId 多会话取最新为 canonical、其余 duplicate-goal（防推活造成目标再分叉），排除主控自身/blank/running/退役与废弃标题/窗外闲置。
- `examples/stall-patrol.mjs`：分页普查（实测 744 会话单页）→ 分类 → seen-set 去重（普通 6h / duplicate 7 天长窗）→ 注入主控判断处置（blocked 类按授权边界只转告用户）；夜间静默 + `--dry-run`。
- `examples/stall-patrol.plist`：launchd 每小时一拍；`rotate-master.mjs` 重指清单 2→3；手册 §3 与 `muse-status.sh` 漂移检查同步。
- 顺带接手断线会话遗留的毒丸修复（mailbox 写侧 kind 校验 + routines 读侧隔离 + 回归，47f2c6c）。

## 验证

- 回归测试 `examples/tests/stall-patrol.test.mjs` 8 条 16 断言全绿（双层 goal 形状回归/todos/inbox/去重/排除/窗口边缘），并抓出一个实 bug：canonical 更新时地图未跟手，第三个同 goal 会话会与已贬为 duplicate 的旧项比较——已修（16/16 前红后绿）。
- 线上：dry-run 与实跑分类一致（今日真样本 1 blocked + 2 duplicate）；kickstart 二跑验证去重静默路径。
- `node --test examples/tests/*.test.mjs` 全套 16 pass。

## 局限

- blocked-goal 的恢复按平台授权边界只能由用户本人发话，巡查只转告不代劳。
- rename 对 goal-active 会话被 keeper 拒（agent-busy），重复会话隔离靠 7 天去重压制而非改名，留待平台侧解除。
- 明日 08:00 rotate-master 首跑后巡查报告将路由到新主控，跨日链路待自然验证。

## 判定

accepted（工程级）：机制当日闭环（探测→分类→去重→上报→处置），分类逻辑有回归测试护住，线上真样本分类正确。
