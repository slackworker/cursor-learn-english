#!/usr/bin/env bash
# 将本项目的 Cursor Hooks 配置与脚本安装到 ~/.cursor/
# 实际逻辑在 setup-cursor-hooks.mjs（跨 Win / WSL / Linux）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/setup-cursor-hooks.mjs" "$@"
