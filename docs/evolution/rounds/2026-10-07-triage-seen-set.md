# 分诊去重加固：容量-1 哈希 → 持久化已见集合（2026-10-07）

## 假设

muse-triage 重复注入的脚本侧修复（0a85460）只存**单个**批次哈希，交替批次（A,B,A）会绕过去重二次注入——同 2026-10-06 08:26-09:26 复现 4 次的失败模式在同批不同序时仍可能复发。用容量 50 的内容寻址持久化已见集合可将「分诊过的批次不得二次投递」从单样本记忆升级为集合记忆。

## 改动

- 新增 `examples/lib/seen-set.mjs`：`seenRecently` / `markSeen`，TTL 剪枝 + cap 驱逐 + 损坏状态文件按空集处理。
- `examples/message-triage.mjs` 迁移到该 helper；`projectDir` 支持 `MUSE_PROJECT_DIR` 覆盖（对齐 gate 约定，测试可隔离）。
- 顺带修复 `examples/tests/timers.test.mjs` 既有红灯：8b596d6 让 gate 手动运行默认加载 local-rules.json 后，测试开始携带真实 jxa-calendar（osascript）+ 真实 LLM judge 延迟（实测 11.5s > 测试 10s 超时，ETIMEDOUT）。测试改用 `--rules <tmp>/no-rules.json` 恢复隔离，超时放宽到 30s。

## 验证

- 新增 `examples/tests/seen-set.test.mjs` 4 条：交替批次回归（容量-1 版本会红的用例）/ TTL 过期 / cap 驱逐 / 损坏文件。
- `pnpm test:timers` 8/8（修复前 7/8）、`pnpm test:evolution` 6/6、`node --check` 通过、夜间路径实跑 exit 0 静默。

## 局限

- 去重跳过路径的端到端实跑未做（需伪造 A 类线索投递真实主会话，不做）；逻辑由单测覆盖，脚本装配由语法检查+实跑冒烟覆盖。
- gate 的 signal 路径与 mailbox 队列仍有各自机制（signal 靠消费文件、队列靠读取即清），未纳入本集合——当前无重复证据，不扩散。

## 判定

accepted（工程级）：回归用例证明旧实现的缝隙，新实现全绿。真实验证继续归 B01 的 24h 观察窗。
