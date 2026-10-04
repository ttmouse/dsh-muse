#!/usr/bin/env bash
# 用法: ./set-cadence-reflect.sh <秒数>（默认 1800 = 30 分钟）
set -e
SECS="${1:-1800}"
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/../gate/local-config.env"
PLIST="$HOME/Library/LaunchAgents/com.dsh-muse.reflect.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dsh-muse.reflect</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/node</string>
    <string>$DIR/reflect.mjs</string>
    <string>--url</string><string>$MUSE_URL</string>
    <string>--session</string><string>$MUSE_SESSION_ID</string>
  </array>
  <key>StartInterval</key><integer>$SECS</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/dsh-muse-reflect.log</string>
  <key>StandardErrorPath</key><string>/tmp/dsh-muse-reflect.log</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "reflect cadence set: every ${SECS}s ($(( SECS / 60 )) min)"
