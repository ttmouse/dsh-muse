#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"

log_metadata() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    local modified lines
    modified="$(stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S %Z' "$path")"
    lines="$(wc -l < "$path" | tr -d ' ')"
    printf '  %s: %s; %s lines (content hidden)\n' "$label" "$modified" "$lines"
  else
    printf '  %s: no log\n' "$label"
  fi
}

echo "== launchd 任务 =="
launchctl list | awk '$3 ~ /dsh-muse/ { print $1, $2, $3; found = 1 } END { if (!found) print "  (未安装)" }'
echo "== 主控会话（权威登记：~/.dsh/muse/master-session.json）=="
if [ -f "$HOME/.dsh/muse/master-session.json" ]; then
  python3 - "$project_dir" <<'PY'
import json, re, os, sys
d = json.load(open(os.path.expanduser('~/.dsh/muse/master-session.json')))
mid = d.get('masterSession') or '（未登记）'
print('  当前主控:', mid)
print('  登记日期:', d.get('date', '?'))
examples = os.path.join(sys.argv[1], 'examples')
for name in ['message-triage.plist', 'ops-warden-trigger.plist', 'stall-patrol.plist', 'restart-recover.plist', 'gate.plist', 'reflect.plist']:
    path = os.path.join(examples, name)
    if not os.path.exists(path):
        print('  %s: (文件不存在)' % name)
        continue
    content = open(path).read()
    m = re.search(r'MUSE_SESSION_ID</key><string>(session-[0-9a-f-]+)', content)
    if not m:
        m = re.search(r'--session</string><string>(session-[0-9a-f-]+)', content)
    pointed = m.group(1) if m else '（未指向任何会话）'
    print('  %s: %s' % (name, '与主控一致' if pointed == mid else '⚠️ 指向 %s，与主控不一致，需重指并重载' % pointed))
PY
else
  echo "  （无 master-session.json）"
fi
echo "== 决策日志元数据（不显示消息内容）=="
log_metadata "gate" "$project_dir/gate-decisions.log"
log_metadata "reflect" "$project_dir/examples/reflect/reflect-decisions.log"
echo "== 记忆文件 =="; wc -l ~/.dsh/memories/main.md 2>/dev/null || echo "  (尚无记忆)"
echo "== 当前会话工作预算 =="
echo "  在 DSH 主会话调用 muse_status 查看当前 goal 与 routine 状态（只读）"
echo "== Muse 身份 =="
if [ -f "$HOME/.dsh/muse/identity.json" ]; then
  python3 -c "
import json
d = json.load(open('$HOME/.dsh/muse/identity.json'))
name = d.get('name') or '（未命名——编辑 ~/.dsh/muse/identity.json 给你的 Muse 起名）'
print(' ', name)
tag = d.get('tagline'); style = d.get('style')
if tag: print('  ', tag)
if style: print('  风格:', style)
"
else
  echo "  （无 identity.json）"
fi
echo "== 待处理信号 =="; [[ -f "$project_dir/MUSE-SIGNAL.md" ]] && echo "  有信号文件" || echo "  (无)"
