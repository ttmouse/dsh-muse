# examples/orchestrator 目录索引

生成时间：2026-10-05T12:38+08:00
索引范围：`/Users/douba/Projects/dsh-muse/examples/orchestrator`（含 workers 子目录）

## 目录结构

```
examples/orchestrator/
├── spawn-worker.mjs
└── workers/
    └── 6bd56df3/
        └── report.md   ← 本文件
```

## 文件索引

### spawn-worker.mjs
- **用途**：主控编排脚本 —— 派生一个工作者（worker）DSH 会话并下发目标合同。
- **用法**：`node spawn-worker.mjs --contract <一句话目标> [--cwd <工作目录>] [--url http://127.0.0.1:19387]`
- **依赖**：`../lib/dsh-client.mjs` 的 `callRpc`（调用 DSH Web GUI 本机 RPC：`session/create`、`session/prompt`）。
- **行为**：
  1. 解析参数（`parseArgs`），`--contract` 必填，缺失则退出码 2；
  2. 通过 `session/create` 创建新会话并取 `sessionId`；
  3. 通过 `session/prompt`（mode: queue）下发「[工作者合同]」提示词，要求独立完成、结果写入 `workers/<sessionId 末 8 位>/report.md`、完成时写「合同完成」；
  4. 输出 JSON：`{ worker, contract, cwd }`，供主控后续用 page/prompt 巡检推进。

### workers/
- 工作者会话产出目录；每个工作者会话按 `sessionId` 末 8 位建立子目录，内含其 `report.md` 交付物。
- 当前条目：`workers/6bd56df3/`（本会话）。

## 关联上下文
- 上级目录 `examples/lib/dsh-client.mjs`：本脚本使用的 DSH RPC 客户端封装（未在本次索引范围内展开）。
