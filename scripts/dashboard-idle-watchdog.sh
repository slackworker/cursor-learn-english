#!/usr/bin/env bash
# 闲置看门狗：无 HTTP 访问超过 IDLE_MINUTES 则释放端口上的服务。
# 由 open-dashboard.sh 拉起；勿直接当桌面入口。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-${PORT:-13180}}"
IDLE_MINUTES="${2:-${IDLE_MINUTES:-45}}"
LAST_ACCESS="$ROOT/.local/dashboard-last-access"
PID_FILE="$ROOT/.local/dashboard.pid"
LOG_FILE="$ROOT/.local/dashboard.log"
MARKER="$ROOT/.local/dashboard-idle-watchdog.${PORT}.pid"

port_listening() {
  ss -tln 2>/dev/null | grep -qE ":${PORT}\\b" || \
    netstat -tln 2>/dev/null | grep -qE ":${PORT}\\b"
}

stop_server() {
  echo "[dashboard] idle ${IDLE_MINUTES}m → stopping :$PORT" >>"$LOG_FILE"
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    # npm 可能留下 next-server 子进程
    sleep 0.5
    rm -f "$PID_FILE"
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
  else
    pids=$(ss -tlnp 2>/dev/null | grep ":${PORT}" | grep -oP 'pid=\K[0-9]+' | sort -u || true)
    for p in $pids; do
      kill "$p" 2>/dev/null || true
    done
  fi
  rm -f "$MARKER"
}

idle_limit=$((IDLE_MINUTES * 60))
echo $$ >"$MARKER"

while true; do
  sleep 60
  if ! port_listening; then
    rm -f "$MARKER"
    exit 0
  fi
  now=$(date +%s)
  last=$(cat "$LAST_ACCESS" 2>/dev/null || echo "$now")
  if (( now - last >= idle_limit )); then
    stop_server
    exit 0
  fi
done
