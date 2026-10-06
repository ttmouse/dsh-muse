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

## pnpm 装了 git 依赖的插件后，`dsh web` 直接启动崩溃

根因：pnpm 安装 git 依赖不执行 `prepack` 脚本，靠 prepack 生成的文件（如 openviking memory-plugin 的 `shared/`）缺失，插件残缺导致整个 web 启动崩溃。修复：手动跑该包的 sync 脚本补文件，或钉住能完整构建的版本。见 [install-notes.md](install-notes.md)。

## 改 profile 的 `cordis.patch.yml` 后，某些插件从组合树里消失了

根因：该文件由插件管理器托管（含注册行与豁免），用 yaml 库 load→dump 整体重写会**静默丢掉**管理器写入的行（tool-memory 曾因此消失）。修复：只做精准文本编辑，或走官方 `dsh plugin` 命令；改完用 dump-config 验证组合树。见 [install-notes.md](install-notes.md)。

## web 模板 profile 里手动加的 bundles 条目莫名被抹掉

根因：web 是出厂模板 profile，当 bundles 列表与「安装所拥有的组合」一致时，CLI 会把 manifest 改写回出厂模板（normalizeShippedProfile）。修复：正规路径用 `dsh plugin add` 安装让管理器接管，不要手写条目；另外 `dsh --profile x --from-default-profile web` 创建的干净 profile 自带 goal 家族，无需手动加组合行。见 [install-notes.md](install-notes.md)。

## 桌面端 CLI 报错 / 豁免了 web 端 desktop 端仍拒绝加载插件

根因：桌面端 profile 管理是 Electron 独占，CLI `dsh plugin --profile desktop` 直接报错；且兼容性豁免按 profile 隔离，web 授过不算数。修复：豁免写在 desktop profile 自己的 `compatibility.json` 里。见 [install-notes.md](install-notes.md)。

## `dsh web` 重启后 `/dsh-taskboard` 404、sessionController unavailable

排查链：先看 `~/.dsh/logs/startup-*.log` 是否 `EADDRINUSE 3080`（旧进程未死导致重启残废）；再查 `~/.dsh/storages/dsh-taskboard/plugin.log`——taskboard 固定端口 47825 与桌面 App（desktop profile）内的另一份 taskboard server 冲突。修复两步：

1. 给 `~/.dsh/profiles/web/cordis.patch.yml` 里的 `@ttmouse/dsh-taskboard` 配 `port: 0`（OS 自动分配，代理路由动态注册不受影响）。
2. 重启必须显式指定 profile：`DSH_PROFILE=web DSH_PROFILE_DIR=~/.dsh/profiles/web nohup dsh web --no-open >> ~/.dsh/dsh-web.log 2>&1 &`——在桌面 App 托管的会话里跑重启脚本会继承 `DSH_PROFILE=desktop`，web 实例以错误 profile 启动，出现同样的 404/插件不挂载。

另注意 macOS 没有 `setsid`，detached 重启用 `nohup bash -c '...' & disown`。

## 日历 source 报 `CALENDAR_TIMEOUT`，巡逻轮被卡住

根因：jxa-calendar 走 osascript 读 Calendar.app，TCC 授权弹窗在 launchd 后台上下文里**无法显示**，会一直挂起（旧超时值 90s 会阻塞整轮巡逻）。修复：gate 已把 osascript 超时改为 30s + 失败快速重试一次 + `CALENDAR_TIMEOUT` 分类；若反复出现，去「系统设置 → 隐私与安全性 → 自动化」前台手动重新授予日历权限。无权限则报 `CALENDAR_PERMISSION_REQUIRED`。见 [gate README](../examples/gate/README.md)。

## 同一批消息通知被重复注入主线两次

根因：gate/triage 层缺少已分诊去重，同一条 muse-triage 消息批次在短时间内被原样重复投递，违反「值得说才开口」。修复：triage 按批次做持久化已见集合（`.gate-state/`），24h 内不二次投递（commit a809461）。若你自己写 source 规则，注意复用同一去重状态文件。

## 本机（macOS）验证打包好的 Electron app，秒退且零输出

根因：宿主 bash 自带 `ELECTRON_RUN_AS_NODE=1`，app 以 Node 模式启动——立刻 exit 0、`--version` 打印 Node 版本、数据目录不创建。修复：`env -u ELECTRON_RUN_AS_NODE` 再启动。另外该上下文里 `open` 拉不起 GUI app，验证走「直接 exec 复制出来的 .app + CDP 探针」。

## 能不能像真 Muse 一样从邮件/日历主动发现事情？

还不能。事件源 ingress（webhook/file-watch → 唤醒）是下一个里程碑，当前主动性只有时间心跳。见 [gaps.md](gaps.md) 与 [proactivity-design.md](proactivity-design.md)。
