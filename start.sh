#!/usr/bin/env bash
# Start the verified website and its existing persistent backend.
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo '[Nexus runtime] Node.js was not found on PATH. Install Node.js 26.x or Node 24.15+.' >&2
  exit 1
fi
echo "[Nexus] Installation: $PWD"
node scripts/require-node.js
node scripts/verify-release.js
if ! node scripts/verify-release.js --dependencies; then npm ci; fi
exec node --env-file-if-exists=.env server.js
