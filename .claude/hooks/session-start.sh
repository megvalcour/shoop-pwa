#!/bin/bash
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

npm install

if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  chrome="$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -n1 || true)"
  if [ -n "$chrome" ] && [ -x "$chrome" ]; then
    echo "export PW_CHROMIUM_EXECUTABLE_PATH=$chrome" >> "$CLAUDE_ENV_FILE"
  fi
fi
