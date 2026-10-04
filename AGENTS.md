# AGENTS.md — dsh-muse

在 DSH 上复刻 Meta Muse 的核心体感：常驻长对话、持续推进、值得说才开口。

## 全局不变量（任何改动不得违反）

1. **自治授权只能来自人类直接请求**——自动续跑、子代理、脚本一律不得授予或撤销。修改 `tool-muse/` 的权限检查时，六种拒绝路径的测试必须保持全绿。
2. **安全红线**：外部凭据不进会话上下文；验证码/密码重置/免密登录内容必须在 gate 预检层确定性滤除（`examples/gate/gate.mjs` 的 `SENSITIVE_PATTERNS`），改动过滤逻辑需附敏感/正常双分支用例。
3. **想法只提议不执行**：反思循环（`examples/reflect/`）产出的 idea 只能作为提议注入主线，不得携带执行指令。

## 路由表

| 当你要做… | 先读 |
|---|---|
| 改 `muse/`（keeper、持久自治意图事件、重新武装逻辑） | [muse/README.md](muse/README.md) + [docs/goals.md](docs/goals.md)（机制对照，防破坏 goal 家族的设计纪律） |
| 改 `tool-muse/` 或 `tool-memory/`（模型工具） | 对应包的 README.md；改权限检查前再看 `tool-muse/src/index.ts` 的 `requireDirectHuman` 先例 |
| 改 `examples/gate/`（闸门、判断门、连接器 source） | [examples/gate/README.md](examples/gate/README.md)（wire 契约、鉴权、敏感过滤）+ [docs/proactivity-design.md](docs/proactivity-design.md) |
| 改 `examples/reflect/`（反思循环） | [examples/reflect/README.md](examples/reflect/README.md) + 记忆 scope 规则（preference→全局，fact/lesson→项目文件） |
| 动 profile 的 `cordis.patch.yml` | [docs/install-notes.md](docs/install-notes.md)——**禁止用 yaml 库整文件重写**（会静默丢插件管理器的注册行），只做精准文本编辑或走 `dsh plugin` 命令 |
| 发布新版本 / 加新包 | [docs/release-checklist.md](docs/release-checklist.md)（包元数据、files 白名单、构建顺序 `pnpm build`） |
| 改主动触发的节奏或语义 | [docs/heartbeat-recipes.md](docs/heartbeat-recipes.md) + [docs/proactivity-design.md](docs/proactivity-design.md)（唤醒与打扰分离是设计核心） |
| 判断「还缺什么才算像 Muse」 | [docs/roadmap.md](docs/roadmap.md) + [docs/gaps.md](docs/gaps.md) |
| 任务产出适合可视化/交互呈现（仪表盘/追踪器/指南） | [docs/artifacts-design.md](docs/artifacts-design.md)——生成自包含 HTML Artifacts 到 `artifacts/`，而非长文本回复 |

## 构建与验证

- 全量：`pnpm install && pnpm build && pnpm -r test`（根 `build` 按依赖顺序跑，勿用 `pnpm -r build` 并行）
- 单包：`pnpm --filter <pkg> build|test`
- 提交前 `git status` 确认 `local-config.env`、`*.log`、`.gate-state/` 未入库（见 .gitignore）

## 目标与节奏约定

- 用户创建长期目标并表达节奏预期（如「每天」「两小时后」）时，优先用 muse_routine 建一条**有预算的专属定时任务**（前提是当前 turn 的直接人类授权与 muse_autonomy）；绑定已有目标时仅做 review，执行仍归 goal-round-driver，多目标各走各的节奏——见 docs/timer-first.md。外部事件和跨对话接入目前暂缓。

## 本机运行态（非仓库内容）

- gate/reflect 由 launchd 托管：`examples/set-cadence-all.sh <gate秒> <reflect秒>` 调频
- 状态一览：`examples/muse-status.sh`
