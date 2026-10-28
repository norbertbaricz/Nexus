#!/usr/bin/env bash
# Run only in the private terminal of the operator hosting this Nexus instance.
set -euo pipefail
cd -- "$(dirname -- "$0")"
node scripts/require-node.js
node scripts/verify-release.js
exec node --env-file-if-exists=.env scripts/recover-account.js "$@"
