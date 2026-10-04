#!/usr/bin/env bash
# 用法: ./set-cadence.sh <秒数>   例: ./set-cadence.sh 600（10分钟）| 1800（30分钟）
set -e
SECS="${1:-600}"
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/local-config.env"
PLIST="$HOME/Library/LaunchAgents/com.dsh-muse.gate.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dsh-muse.gate</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/node</string>
    <string>$DIR/gate.mjs</string>
    <string>--url</string><string>http://127.0.0.1:19387</string>
    <string>--session</string><string>$MUSE_SESSION_ID</string>
    <string>--rules</string><string>$DIR/local-rules.json</string>
    <string>--judge</string>
  </array>
  <key>StartInterval</key><integer>$SECS</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/dsh-muse-gate.log</string>
  <key>StandardErrorPath</key><string>/tmp/dsh-muse-gate.log</string>
</dict></plist>
XML
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "cadence set: every ${SECS}s ($(( SECS / 60 )) min) — plist: $PLIST"
