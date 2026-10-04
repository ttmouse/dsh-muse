#!/usr/bin/env bash
# 一条命令调全部节奏: ./set-cadence-all.sh <gate秒> <reflect秒>
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/gate/set-cadence.sh" "${1:-600}"
"$SCRIPT_DIR/reflect/set-cadence-reflect.sh" "${2:-1800}"
