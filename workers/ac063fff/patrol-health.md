# launchd 巡检健康报告（com.dsh-muse.*）

巡检时间：2026-10-05 12:43 +08:00
检查对象：gate / reflect / memory-maintenance 三个 launchd 任务

## 汇总

| 任务 | launchd 状态 | 最近退出码 | 运行次数 | 日志文件 | 日志新鲜度 | 健康 |
|---|---|---|---|---|---|---|
| com.dsh-muse.gate | running（当前有实例） | 0（runs=213） | 213 | /tmp/dsh-muse-gate.log | 12:23（约 20 分钟前） | ⚠️ 有错误记录 |
| com.dsh-muse.reflect | 正常退出 | 0（runs=247） | 247 | /tmp/dsh-muse-reflect.log | 12:43（秒级新鲜） | ✅ |
| com.dsh-muse.memory-maintenance | not running | 从未退出（runs=0） | 0 | /tmp/dsh-muse-maintenance.log | 文件不存在 | ℹ️ 符合预期 |

## 详细

### com.dsh-muse.gate — ⚠️
- plist：`~/Library/LaunchAgents/com.dsh-muse.gate.plist`，StartInterval=120s，日志 /tmp/dsh-muse-gate.log。
- launchctl：state=running，runs=213，last exit code=0；当前有一个 gate 实例正在运行（PID 12442）。
- 日志 mtime 12:23:59，距巡检约 20 分钟；gate 仅在异常时写日志，静默期不代表停跑（实例正在运行可证）。
- 日志中发现的问题：
  1. `Error: judge must return a boolean worth_saying`（gate.mjs:183）——judge LLM 返回值未通过布尔校验，导致该次 gate 判定失败退出。
  2. `gate: jxa-calendar failed: Error: spawnSync osascript ETIMEDOUT` ×2 —— osascript 调用超时（JXA 日历采集通道不可用/阻塞）。
  3. 正常记录：`gate: blocked by F5 (prompt-injection pattern)`——规则拦截功能工作正常。

### com.dsh-muse.reflect — ✅
- StartInterval=120s，日志 /tmp/dsh-muse-reflect.log。
- launchctl：runs=247，last exit code=0。
- 日志秒级新鲜（mtime 与巡检时刻一致），尾部均为 `unchanged inputs; no LLM call` / `memory +0; idea none`——输入无变化时跳过 LLM 调用，属正常节流行为。

### com.dsh-muse.memory-maintenance — ℹ️ 符合预期
- StartCalendarInterval：每日 04:00，日志约定路径 /tmp/dsh-muse-maintenance.log。
- launchctl：runs=0，last exit code=(never exited)。
- plist 加载时间为今日 04:27（晚于 04:00 触发点），因此今天未触发、日志文件尚未创建是预期行为；下次运行明天 04:00。无法用退出码验证，建议明天 04:00 后复查。

## 结论与建议
- 三个任务均已正确加载（launchctl list 退出码 0/never exited，无异常重试）。
- reflect 健康；memory-maintenance 待首次运行验证。
- gate 需关注两点：
  1. judge 返回值校验失败（建议在 gate.mjs 对 LLM 输出做宽容解析/重试）；
  2. jxa-calendar osascript ETIMEDOUT（建议加超时降级，避免拖慢 gate 主流程）。
