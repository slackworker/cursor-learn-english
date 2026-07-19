#!/usr/bin/env bash
# WSL 侧：确保仪表盘在跑。由 Windows 桌面 .cmd 调用。
# PORT 默认 13180；IDLE_MINUTES 默认 45（无页面访问则自动停服）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-13180}"
IDLE_MINUTES="${IDLE_MINUTES:-45}"
NODE_BIN="${NODE_BIN:-${HOME}/.nvm/versions/node/current/bin}"
export PATH="$NODE_BIN:$PATH"

cd "$ROOT"
mkdir -p "$ROOT/.local"
LAST_ACCESS="$ROOT/.local/dashboard-last-access"
PID_FILE="$ROOT/.local/dashboard.pid"
LOG_FILE="$ROOT/.local/dashboard.log"
WATCHDOG_MARKER="$ROOT/.local/dashboard-idle-watchdog.${PORT}.pid"

port_listening() {
  ss -tln 2>/dev/null | grep -qE ":${PORT}\\b" || \
    netstat -tln 2>/dev/null | grep -qE ":${PORT}\\b"
}

touch_access() {
  date +%s >"$LAST_ACCESS"
}

needs_rebuild() {
  local marker="$ROOT/.next/BUILD_ID"
  if [[ ! -f "$marker" ]]; then
    return 0
  fi
  # 源码或依赖清单比生产构建更新时重建，避免沿用过期的 .next
  if [[ "$ROOT/package.json" -nt "$marker" ]] || \
     [[ "$ROOT/package-lock.json" -nt "$marker" ]] || \
     [[ "$ROOT/next.config.ts" -nt "$marker" ]]; then
    return 0
  fi
  if find "$ROOT/app" "$ROOT/components" "$ROOT/lib" "$ROOT/public" \
      -type f -newer "$marker" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

start_server() {
  if needs_rebuild; then
    echo "[dashboard] building…" >&2
    npm run build >>"$LOG_FILE" 2>&1
  fi
  touch_access
  echo "[dashboard] starting on :$PORT" >&2
  nohup env PORT="$PORT" HOSTNAME=127.0.0.1 npm run start >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 90); do
    if port_listening; then
      return 0
    fi
    sleep 0.5
  done
  echo "[dashboard] failed to start; see $LOG_FILE" >&2
  return 1
}

start_idle_watchdog() {
  if [[ -f "$WATCHDOG_MARKER" ]]; then
    old=$(cat "$WATCHDOG_MARKER" 2>/dev/null || true)
    if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
      return 0
    fi
    rm -f "$WATCHDOG_MARKER"
  fi
  nohup bash "$ROOT/scripts/dashboard-idle-watchdog.sh" "$PORT" "$IDLE_MINUTES" \
    >>"$LOG_FILE" 2>&1 &
  disown || true
}

stop_server() {
  if [[ -f "$PID_FILE" ]]; then
    old=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
      echo "[dashboard] stopping pid $old" >&2
      kill "$old" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$old" 2>/dev/null || break
        sleep 0.25
      done
      kill -9 "$old" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # 兜底：按端口回收残留 next-server
  if port_listening; then
    pids=$(ss -tlnp 2>/dev/null | grep -E ":${PORT}\\b" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)
    for p in $pids; do
      echo "[dashboard] killing listener pid $p" >&2
      kill "$p" 2>/dev/null || true
    done
    sleep 0.5
  fi
}

touch_access

if port_listening; then
  if needs_rebuild; then
    echo "[dashboard] source newer than build; restarting…" >&2
    stop_server
    start_server
  else
    echo "[dashboard] already on :$PORT" >&2
  fi
else
  start_server
fi

start_idle_watchdog

if command -v curl >/dev/null 2>&1; then
  curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${PORT}/" && touch_access || true
fi

echo "READY http://127.0.0.1:${PORT}/"
