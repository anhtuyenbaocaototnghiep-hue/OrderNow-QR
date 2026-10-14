#!/usr/bin/env bash
# Đồng bộ skills từ nguồn chính .agent/skills sang thư mục mà công cụ AI nhận diện.
#   bash kịch-bản/sync-skills.sh                    # mặc định: .claude/skills (Claude Code)
#   bash kịch-bản/sync-skills.sh .agents/skills     # Codex
#   bash kịch-bản/sync-skills.sh .cursor/skills     # Cursor
#   bash kịch-bản/sync-skills.sh --check [target…]  # chỉ kiểm, báo DRIFT và exit 1 nếu lệch (dùng trong CI)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.agent/skills"
check=0
targets=()
for arg in "$@"; do
  case "$arg" in
    --check) check=1 ;;
    .claude/skills|.agents/skills|.cursor/skills) targets+=("$arg") ;;
    *) echo "Target không hỗ trợ: $arg (chỉ .claude/skills | .agents/skills | .cursor/skills)" >&2; exit 2 ;;
  esac
done
[ ${#targets[@]} -eq 0 ] && targets=(".claude/skills")
[ -d "$SRC" ] || { echo "Không thấy $SRC" >&2; exit 2; }

status=0
for t in "${targets[@]}"; do
  dst="$ROOT/$t"
  if [ "$check" -eq 0 ]; then
    rm -rf "$dst"
    mkdir -p "$dst"
    cp -R "$SRC/." "$dst/"
  fi
  if diff -r "$SRC" "$dst" >/dev/null 2>&1; then
    echo "OK     $t"
  else
    echo "DRIFT  $t"
    diff -rq "$SRC" "$dst" || true
    status=1
  fi
done
exit $status
