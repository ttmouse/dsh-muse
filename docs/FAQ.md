# FAQ / 常见问题

## 装完插件面板显示「未生效 / 普通依赖(未声明 dsh 元数据)」

包必须自带 `dsh.bundle.patch` 元数据并被列入 profile 的 `dsh.profile.bundles`。本仓库两个包已自带元数据；如果你手写 profile patch 行而不是用插件管理器安装，面板会归类为普通依赖。正规路径：`dsh plugin --profile <name> add <pkg>`，然后把两个 bundle 加进 bundles 列表（goal 家族之后）。

## 面板显示「bundle patch 含配置/表达式，热挂载仅支持纯 insert，重启后生效」

对 bundle 类插件这是**常驻的机制说明**，不代表加载失败。判断生效与否的唯一标准：新开会话问 agent 工具列表，看有没有 `muse_autonomy`。

## 启动报 `unknown event type "muse/intent"`，会话打不开

这是持久化格式守卫在工作：写入过 `muse/intent` 的会话，在**没装 muse 的**运行时上 resume 会被拒绝。修复：编辑该会话的 `session.jsonl`，删掉含 `"muse/intent"` 的行（丢失的是自治授权记录，目标本身保留）。

## 插件被兼容门禁拒绝（「stays installed but startup denies it」）

peer 依赖版本与运行时不匹配时，插件保持安装但启动拒绝加载，且**豁免按 profile 隔离**——A profile 授过豁免，B profile 照样被拒。在对应 profile 的 `compatibility.json` 里显式豁免（`包@版本: [运行时版本]`），重启生效。

## 建了目标，推进一两轮就停了等我说话

自治没有被记录：agent 没有调用 `muse_autonomy { autonomy: true }`。换更明确的授权话术——「持续推进 / 不用再问我 / keep going until done」这类直接表达。注意只有人类的直接请求能触发授权，转述或子代理来源会被拒绝（设计如此）。

## 重启后目标不自动恢复

keeper 的双触发点是 session-start 和首次 idle。若 `dsh resume` 后队列为空，靠 session-start 触发；若仍不恢复，先确认重启前 `muse_autonomy{true}` 确实被调用过（查 session log 里的 `muse/intent` 事件），再提 issue。

## 心跳提醒不触发 / 迟到

定时投递需要会话空闲：agent 忙碌（目标自动续跑）时提醒被压住，空闲后补投。所以心跳语义必须容忍「醒来时已迟到 N 个周期」——这是 at-least-once，不是精确时刻。

## headless（`dsh --profile x "task"`）里目标推进一轮就退出

预期行为：one-shot 宿主在首个静默点退出，不等 goal-round-driver 的延迟续跑。持续推进需要 web GUI 这类常驻宿主。

## 能不能像真 Muse 一样从邮件/日历主动发现事情？

还不能。事件源 ingress（webhook/file-watch → 唤醒）是下一个里程碑，当前主动性只有时间心跳。见 [gaps.md](gaps.md) 与 [proactivity-design.md](proactivity-design.md)。
