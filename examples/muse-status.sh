#!/usr/bin/env bash
# 一眼看清 Muse 全部主动组件的状态
echo "== launchd 任务 =="
launchctl list | grep dsh-muse || echo "  (未安装)"
echo "== 最近 gate 决策 =="; tail -3 ~/Projects/dsh-muse/examples/gate/gate-decisions.log 2>/dev/null || echo "  (无)"
echo "== 最近反思 =="; tail -3 ~/Projects/dsh-muse/examples/reflect/reflect-decisions.log 2>/dev/null || echo "  (无)"
echo "== 记忆文件 =="; wc -l ~/.dsh/memories/main.md 2>/dev/null || echo "  (尚无记忆)"
echo "== 待处理信号 =="; ls ~/Projects/dsh-muse/MUSE-SIGNAL.md 2>/dev/null || echo "  (无)"
