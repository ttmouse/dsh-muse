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
echo "== 决策日志元数据（不显示消息内容）=="
log_metadata "gate" "$project_dir/examples/gate/gate-decisions.log"
log_metadata "reflect" "$project_dir/examples/reflect/reflect-decisions.log"
echo "== 记忆文件 =="; wc -l ~/.dsh/memories/main.md 2>/dev/null || echo "  (尚无记忆)"
echo "== 当前会话工作预算 =="
echo "  在 DSH 主会话调用 muse_status 查看当前 goal 与 routine 状态（只读）"
echo "== 待处理信号 =="; [[ -f "$project_dir/MUSE-SIGNAL.md" ]] && echo "  有信号文件" || echo "  (无)"
