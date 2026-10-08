#!/usr/bin/env bash
# 用法: ./set-cadence-reflect.sh <秒数>（默认 1800 = 30 分钟）
#
# 2026-10-08 改（修注入目标漂移的复发路径）：
#   - plist 正本写在仓库内 examples/reflect.plist，launchd 直接从该路径加载；
#   - 会话 id 一律取权威登记 ~/.dsh/muse/master-session.json（仅在登记缺失时兜底 local-config.env）；
#   - 旧的 ~/Library/LaunchAgents 副本会被 bootout 并改名为 .legacy-<时间戳>。
set -e
SECS="${1:-1800}"
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
PLIST="$REPO/examples/reflect.plist"
LEGACY="$HOME/Library/LaunchAgents/com.dsh-muse.reflect.plist"
REGISTRY="$HOME/.dsh/muse/master-session.json"
LABEL="com.dsh-muse.reflect"

MUSE_URL="${MUSE_URL:-http://127.0.0.1:19387}"
SESSION_ID="$(node -e "try{process.stdout.write(require(process.env.HOME+'/.dsh/muse/master-session.json').masterSession||'')}catch(e){}" 2>/dev/null || true)"
if [ -z "$SESSION_ID" ] && [ -f "$DIR/../gate/local-config.env" ]; then
  # shellcheck disable=SC1091
  source "$DIR/../gate/local-config.env"
  SESSION_ID="${MUSE_SESSION_ID:-}"
  MUSE_URL="${MUSE_URL:-http://127.0.0.1:19387}"
fi
if [ -z "$SESSION_ID" ]; then
  echo "set-cadence-reflect: 无法确定会话 id（$REGISTRY 缺失且无兜底配置）" >&2
  exit 2
fi

cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/node</string>
    <string>$DIR/reflect.mjs</string>
    <string>--url</string><string>$MUSE_URL</string>
    <string>--session</string><string>$SESSION_ID</string>
  </array>
  <key>StartInterval</key><integer>$SECS</integer>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/dsh-muse-reflect.log</string>
  <key>StandardErrorPath</key><string>/tmp/dsh-muse-reflect.log</string>
</dict></plist>
XML

# 先处理旧 ~/Library 副本：它与正本同 Label，若在 bootstrap 之后按路径 bootout，
# 会把刚装好的正本一起摘掉（2026-10-08 实测踩中）。
if [ -f "$LEGACY" ]; then
  launchctl bootout "gui/$(id -u)" "$LEGACY" 2>/dev/null || true
  mv "$LEGACY" "$LEGACY.legacy-$(date '+%Y%m%d%H%M%S')"
  echo "set-cadence-reflect: 旧 ~/Library 副本已停用并改名（避免回退旧会话）"
fi

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "reflect cadence set: every ${SECS}s ($(( SECS / 60 )) min) — plist: $PLIST (session $SESSION_ID)"
