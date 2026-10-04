#!/usr/bin/env bash
# 一条命令调全部节奏: ./set-cadence-all.sh <gate秒> <reflect秒>
./gate/set-cadence.sh "${1:-600}"
./reflect/set-cadence-reflect.sh "${2:-1800}"
