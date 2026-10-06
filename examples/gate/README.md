# gate — 对话外主动闸门（ingress v0）

**确定性预检在对话外运行：没事零痕迹，有事才注入主线。** 解决两个问题：心跳频率可以拉到每分钟（纯脚本检查，毫秒级零成本），主线不再出现「无事发生」的唤醒卡片。

## 架构

```
launchd / cron（每 1 分钟）
  → gate.mjs：确定性检查（MUSE-SIGNAL.md 信号文件 / 自定义规则）
      ├─ 无信号 → 退出。零成本、零痕迹、主线完全安静
      └─ 有信号 → 先进入本地持久 mailbox；原生插件核验授权后，以非人类来源投递主线
```

## 用法

```bash
node gate.mjs --session <sessionId> [--url http://127.0.0.1:3080] [--rules rules.json] [--dry-run]
```

- 信号约定：项目根目录放一个 `MUSE-SIGNAL.md`，第一个非标题行就是注入给 agent 的消息；注入后文件自动删除（触发一次）。
- 自定义规则（`--rules rules.json`）：

```json
[
  { "type": "file-exists", "path": "/tmp/deploy-done.flag", "message": "部署完成了，看一下日志" }
]
```

- `--dry-run`：只打印将注入的内容，不真正调用。

## 投递与鉴权

新版 gate 不调用 `session/prompt`。共享客户端的 `injectPrompt` 写入 `$DSH_HOME/muse/notices/`，原生插件在同一会话空闲且自治授权有效时入队，并先刷盘宿主收件箱再确认投递。`queued` 只代表已持久化待办，不代表 agent 已处理。

只读会话查询仍可使用回环 RPC 和本机签名 cookie。凭据不进入模型上下文。反思的 idea 消息使用非人类来源，工具执行由硬性门禁拒绝。

## launchd 模板（macOS）

`~/Library/LaunchAgents/com.dsh-muse.gate.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dsh-muse.gate</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/dsh-muse/examples/gate/gate.mjs</string>
    <string>--session</string><string>session-YOUR-ID</string>
    <string>--url</string><string>http://127.0.0.1:YOUR-PORT</string>
  </array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
```

`launchctl load ~/Library/LaunchAgents/com.dsh-muse.gate.plist` 后即生效。Linux 用 cron 等价：`* * * * * node /path/to/gate.mjs --session ...`。

## 巡逻间隔 watchdog（自监控）

每次巡逻开始时，gate 会把时间戳写入 `.gate-state/last-patrol.json` 并与上一次对比：间隔超过 **30 分钟**（正常 2-30 分钟）说明 launchd 可能丢失或机器休眠过，gate 会在决策日志里记一条 `watchdog: 巡逻间隔 N 分钟……本轮自动恢复` 并继续本轮巡逻（自动恢复，不需人工干预）。该文件在 `.gate-state/` 下，不入库。

## 日历 source（jxa-calendar）与超时策略

`rules.json` 支持 `jxa-calendar`：通过 osascript JXA 读取本地 Calendar.app 未来 N 小时（`hoursAhead`，默认 24）的事件，支持 `calendar`/`excludeCalendars` 过滤，事件按 `start|summary` 去重（状态文件 `.gate-state/jxa-calendar.json`，只报告新事件）。

超时策略：osascript 超时为 **30 秒**（健康运行实测 4-14s；旧值 90s 会在 TCC 授权弹窗后台挂起时阻塞整轮巡逻）。超时后自动**快速重试一次**；仍失败则抛出 `CALENDAR_TIMEOUT` 错误分类——若反复出现，去「系统设置 → 隐私与安全性 → 自动化」重新授予日历权限（TCC 授权弹窗在 launchd 后台上下文里无法显示，需前台手动确认）。无权限则抛 `CALENDAR_PERMISSION_REQUIRED`。

## 验证

`pnpm test:timers` 覆盖静默、敏感内容在判断前拒绝、正常信号持久排队与 dry-run 不消费信号。原生投递、失败重试和重启恢复见 muse 包测试。运行环境未加载新版插件时，待办保留而不会伪装成人类消息。

## 连接器 source（P1）与敏感过滤（P5）

**授权引导（permissionGuide）**：任何 source 规则可加 `permissionGuide` 字段——当该 source 因权限失败（EPERM、缺凭据）时，gate 会输出这段引导文案并记入日志，而不是裸报错。参考 `local-rules.example.json`。

`rules.json` 支持 `http-poll`：定时拉取任意 JSON API（RSS 桥、ics 转换器、webhook 收集器），只报告**新增**条目（状态文件去重）：

```json
[ { "type": "http-poll", "url": "https://example/feed.json", "select": "items",
    "messageTemplate": "新动态：$text" } ]
```

**安全红线（P5）**：所有候选消息先过确定性敏感滤除（验证码/密码重置/免密登录链接），敏感内容在预检层丢弃、永不进入 agent 上下文——这是接邮箱类高价值账号的前提。

## 本机节奏管理（已实测装好）

```bash
./set-cadence-all.sh 600 1800   # gate 10 分钟、reflect 30 分钟
./set-cadence-all.sh 600 600    # 都 10 分钟（白天高频迭代）
./set-cadence-all.sh 1800 3600  # 睡觉时放慢：gate 30 分钟、reflect 1 小时
```

会话 id 与端口在 `gate/local-config.env`。launchd 日志：`/tmp/dsh-muse-gate.log`、`/tmp/dsh-muse-reflect.log`。

决策日志（`gate-decisions.log` / `reflect-decisions.log`）已**元数据化**：`examples/muse-status.sh` 只显示日志的修改时间和行数（content hidden），不再打印消息内容——避免把巡逻细节/注入内容泄漏到状态输出里；要看内容需直接打开日志文件。
IMAP 邮件源：在 `gate/local-rules.json` 加 `{"type":"imap","host":"imap.gmail.com","port":993,"user":"你@gmail.com","passwordRef":"MUSE_IMAP_PASSWORD","markSeen":true}`，密码存 `~/.dsh/.credentials.yaml` 的 `MUSE_IMAP_PASSWORD:` 键。
