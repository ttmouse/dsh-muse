# R-B04-status-tool · 当前会话状态摘要

- 日期 / 检查时刻：2026-10-05 Asia/Shanghai
- 候选：B04 → waiting
- 执行者：主 Agent 单写
- 范围：只读当前 DSH 会话内的 goal 与 routines；不读决策日志，不复制数据到静态文件，不新建调度器
- 验收：一次只读工具调用同时呈现 goal phase/activation/剩余轮数/阻塞原因，以及每条 routine 的状态、runs/maxRuns/剩余次数/下一次执行/最近结果/下一步；缺失 goal 或 routine 时明确表示为空
- 非目标：此工程验证不代表用户找状态更快；真实 DSH 会话中的可解释性和用户评价仍需实测
- 回退：移除新增 read-only tool 和对应文档/测试，既有授权及 routine API 不变

## 基线观察

- `examples/muse-status.sh` 当前只列 launchd 匹配项、gate/reflect 日志尾部、记忆行数和信号文件；不显示当前 goal、routine 预算或等待原因。
- 该脚本直接 `tail -3` 决策日志。gate 在某些分支把候选消息写入同一日志，因此状态查询不应把原始日志内容带入对话。
- 现有 `muse_routine list` 已暴露 session 内的 runs/maxRuns、nextRunAt、waiting/completed/paused 状态、last summary 与 next step；goal service 提供 phase、activation、roundsStarted、maxGoalRounds 和 blockedReason。
- 假设：把这些现有只读字段合并成 `muse_status`，能在不引入第二份状态存储/调度器的前提下，给当前会话一个可读快照。

## 结果与局限

- `tool-muse` 新增只读 `muse_status`，合并当前 session 的 goal 阶段、武装状态、剩余轮数、阻塞原因，以及 routines 的状态、预算、下次运行、最近结果与下一步；不返回 routine prompt、不访问其他 session、不写数据。
- 本地 `dsh-tools` 契约确认 Web Client 通用工具卡展示持久化结果文本，不消费 `presentCall()`。因此 `muse_status` 现在把结果格式化成分行中文状态摘要，保留结构化返回值；日期明确标成 UTC，避免把服务器时区假装成本地时区。
- `examples/muse-status.sh` 改为只显示 gate/reflect 日志的修改时间与行数，不再把原始消息打到终端；`node examples/muse.mjs status` 实跑退出码 0，展示当前组件状态和日志元数据。
- 现有 `examples/muse-dashboard/muse-dashboard.html` 只汇总巡逻、记忆和想法，不显示当前 goal/routine 执行状态或预算；静态系统仪表盘不满足本候选合同。
- 当前看板经本机 HTTP loopback 用可见 Chromium / Playwright 重新渲染检查：1440×1000 桌面与 390×844 移动视口均无横向溢出，移动版为单列；本页没有外部请求。7 项候选筛选结果为 waiting 4 项、accepted 2 项。
- `dsh --profile muse-scratch --no-open --host 127.0.0.1 --port 0` 启动后打印服务地址，随后手动停止；这证明 scratch Web 组合启动完成，但没有新建对话、检查新会话工具列表或调用 `muse_status`，因此不算状态工具运行验收。
- 为修复 Web Client 折叠工具行只显示工具名和 callId 的问题，`tool-muse` 增加 `dsh.client` 浏览器扩展，并通过 `tool.call.toolview` 为 `muse_status` 注册专属行。折叠行直接显示目标阶段、剩余轮数、阻塞原因和每条 routine 的剩余次数；展开后显示同一调用的完整结果。无目标/无 routine 也明确显示。浏览器组件仅从已持久化的 tool result 渲染，不额外读会话或写状态。
- `pnpm --filter @deepseek-ai/dsh-tool-muse build` 生成 `lib/client.js` 浏览器加载器 bundle，TypeScript 与 bundle 构建成功；`tool-muse` 测试由 10 项增至 13 项，状态摘要新增用例全过。该验证只证明包构建和摘要逻辑，尚未证明 DSH Web 已加载此扩展或实际交互可用。
- 新 bundle 构建后再次启动 `muse-scratch`：本地服务监听临时 loopback 端口；未携带服务授权信息的 `/` 请求返回 HTTP 401。随后停止服务。没有访问带授权的页面、检查 `__DSH_BOOT__` 清单、新建对话或调用工具；故只确认服务可启动，不能确认客户端模块加载。
- 进一步用可见 Chromium 打开 scratch Web 页面并确认首次预览说明；确认后 `window.__DSH_BOOT_READY__` 为 true，`__DSH_BOOT__.entries` 共 66 项，含 `@deepseek-ai/dsh-tool-muse`，注入依赖为 `@deepseek-ai/dsh-client-runtime` 和 `@deepseek-ai/dsh-client-ui-tool`。从页面请求该包的 client bundle 返回 HTTP 200，bundle 含 `muse_status` 与自定义摘要文案；1440×1000 页面截图显示 Web shell 正常启动。未新建对话、读取旧会话或调用状态工具，因此实际 slot 渲染和状态交互仍未验证。
- 随后在监听器预先就绪的真实页面加载中观察网络：boot ready 后 4 秒内没有自动请求 `tool-muse/client.js`；之前的 HTTP 200 来自显式 `fetch`，不是 Web Client 自动加载。当前空白 shell 未选工作区，所以 manifest 存在仍不能证明会话启动时加载或 slot 注册成功。
- 后续可见 Chromium 启动观察等到 composer 已可输入后再继续 15 秒；`__DSH_BOOT_READY__` 为 true、manifest 仍包含扩展，但自动 `tool-muse/client.js` response 数为 0。没有向 DSH 输入 prompt；实际工具注册/渲染仍需真实请求触发。
- 通过页面公开 boot globals 检查模块导入入口：manifest 在，但空白页未暴露 `window.__DSH_MODULES__`，所以无法在此上下文调用其 `import` 完成宿主侧装载验证。没有注入伪造 host context 或发消息。
- 工程验证：`pnpm --filter @deepseek-ai/dsh-tool-muse build` 退出码 0；tool-muse 包测试 10/10；`muse` 包测试 31/31。`muse/tests/restart.spec.ts` 挂载真实 AgentLoop、GoalService、Muse、tool-muse，分别验证空状态和有 goal/routine 的可读结果；合成直接人类 turn 创建临时数据，测试结束前撤销授权，并断言 prompt 未泄露。`bash -n examples/muse-status.sh`、`pnpm evolution:check`、`git diff --check` 均通过。
- 真实 AgentLoop 集成已覆盖空状态和有 goal/routine，工具卡持久结果现在是分行摘要；目标看板的响应式呈现与筛选也已验证。scratch Web 组合能启动，但新会话工具可用性、状态工具交互和用户可解释性仍 unknown；没有把 Codex 授权伪装成 DSH 直接人类 turn。
- 判定：inconclusive，B04 转 waiting。
- 下一步：由人类在 scratch DSH 选择工作区并发起一条普通请求，触发只读 `muse_status`；确认会话激活后浏览器自动加载 bundle，再查看无 goal/routine 时折叠摘要与展开详情。有状态分支只能用已获授权的 goal/routine 数据验证；最后由用户评价是否足以说明当前工作、等待原因和剩余预算。不得伪造人类消息或更改生产 profile。
