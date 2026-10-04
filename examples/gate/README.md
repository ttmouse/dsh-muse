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

## 验证

`pnpm test:timers` 覆盖静默、敏感内容在判断前拒绝、正常信号持久排队与 dry-run 不消费信号。原生投递、失败重试和重启恢复见 muse 包测试。运行环境未加载新版插件时，待办保留而不会伪装成人类消息。

## 连接器 source（P1）与敏感过滤（P5）

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
IMAP 邮件源：在 `gate/local-rules.json` 加 `{"type":"imap","host":"imap.gmail.com","port":993,"user":"你@gmail.com","passwordRef":"MUSE_IMAP_PASSWORD","markSeen":true}`，密码存 `~/.dsh/.credentials.yaml` 的 `MUSE_IMAP_PASSWORD:` 键。
