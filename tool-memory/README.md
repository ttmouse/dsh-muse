# @deepseek-ai/dsh-tool-memory

记忆工具 + 每 turn 记忆注入：`memory_save`（支持 supersedes 纠正语义与 project/global scope）+ 动态 prompt 注入 + 生命周期维护（归档/去重）。

## 文档

- 英文版与完整机制：见 [docs/goals.md](../docs/goals.md)、[docs/heartbeat-recipes.md](../docs/heartbeat-recipes.md)
- 测试：`pnpm --filter @deepseek-ai/dsh-tool-memory test`

## 身份文件（E2）

`~/.dsh/muse/identity.json`：你的 Muse 的名字/格言/风格（人类可编辑，留空=未命名）。
