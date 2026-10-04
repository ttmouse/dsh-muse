# gate — 对话外主动闸门（ingress v0）

**确定性预检在对话外运行：没事零痕迹，有事才注入主线。** 解决两个问题：心跳频率可以拉到每分钟（纯脚本检查，毫秒级零成本），主线不再出现「无事发生」的唤醒卡片。

## 架构

```
launchd / cron（每 1 分钟）
  → gate.mjs：确定性检查（MUSE-SIGNAL.md 信号文件 / 自定义规则）
      ├─ 无信号 → 退出。零成本、零痕迹、主线完全安静
      └─ 有信号 → 经 DSH API 注入主线对话，agent 醒来处理
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

## 鉴权说明（重要）

脚本从 owner-only 的 `~/.dsh/.credentials.yaml`（`client-connection/browser-session` 记录）读取本地浏览器会话密钥，按 DSH 的 cookie 签名方案（HMAC-SHA256）自铸凭证。**凭证不出本机、不落盘到别处**；脚本必须以同一 OS 用户运行（这正是凭证文件 600 权限的边界）。

## wire 契约（供调试）

```
POST {url}/api/session/prompt
body: { type: "client-request", rpcId: <uuid>, method: "session/prompt",
        payload: { args: { _request: { sessionId, mode: "queue",
                                       content: [{ type: "text", text }] } } } }
Cookie: dsh-auth-<b64url(sha256(authority))>=v1.<b64url(json payload)>.<b64url(hmac)>
```

实测路径：404 = 鉴权已过但路径/信封不对；401 = cookie 无效。

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

## 已验证

- 静默分支：无信号 → 零输出退出
- 开口分支：信号文件 → `would inject`（dry-run）
- 真实注入：信号 → `injected` → 主线会话收到 `[muse-gate]` 消息（本仓库开发过程中实测）

## wire 契约补充（0.1.5-rc.2 实测）

- `session/prompt` 的 args 字段名是 `request`（`session/list` 是 `_request`）——共享客户端会从网关报错里自动学习正确字段名
- request 里需要 `requestId`（uuid）
- 共享模块在 `examples/lib/dsh-client.mjs`：mintCookie / callRpc / injectPrompt / llmJson，reflect 脚本复用

## 连接器 source（P1）与敏感过滤（P5）

`rules.json` 支持 `http-poll`：定时拉取任意 JSON API（RSS 桥、ics 转换器、webhook 收集器），只报告**新增**条目（状态文件去重）：

```json
[ { "type": "http-poll", "url": "https://example/feed.json", "select": "items",
    "messageTemplate": "新动态：$text" } ]
```

**安全红线（P5）**：所有候选消息先过确定性敏感滤除（验证码/密码重置/免密登录链接），敏感内容在预检层丢弃、永不进入 agent 上下文——这是接邮箱类高价值账号的前提。
