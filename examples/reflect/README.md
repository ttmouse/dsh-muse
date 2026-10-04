# reflect — 反思循环（Muse 的「持续思考」）

脚本侧自我反思：收集记忆文件 + 主会话近期上下文（`session/page` 光标自适应）→ 一次廉价 LLM 反思 → 三类输出各走各的门：

1. **memory_additions** → 去重后按 scope 落盘（preference → 全局 `main.md`；fact/lesson → 项目文件 `memories/projects/<slug>.md`）
2. **idea** → 只作为**提议**注入主线（`[muse-idea] ... 要我做就说一声`），绝不携带执行指令
3. **plan_note** → 记入 reflect-decisions.log

## 用法

```bash
node reflect.mjs --session <sessionId> [--url http://127.0.0.1:3080] [--dry-run] [--history 12]
```

挂 launchd/cron 低频执行（如每小时）。无事时输出 `no idea worth saying`，完全安静。
真实运行需要 `DEEPSEEK_API_KEY`（env 或 `~/.dsh/.credentials.yaml`）。

## 已验证

- 真实运行：history 缺失/为空时优雅降级；LLM 保守判定（无新记忆、无想法时不注入）
- scope 分流：mock 双类记忆实测分别落入全局/项目文件
- 想法注入复用 gate 的 session/prompt 链路（已实测）
