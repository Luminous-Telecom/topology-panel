#!/usr/bin/env bash
# Publica em homolog ao encerrar o agente, se houver mudança local no plugin.
set -euo pipefail

cat > /dev/null

root="$(cd "$(dirname "$0")/../.." && pwd)"
deploy="$root/scripts/deploy.sh"
log="$root/.cursor/hooks/auto-deploy.log"

if [[ ! -x "$deploy" ]]; then
  exit 0
fi

if ! git -C "$root" rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

if ! git -C "$root" status --porcelain -- \
  src \
  package.json \
  package-lock.json \
  tsconfig.json \
  .config/webpack \
  | grep -q .; then
  exit 0
fi

{
  echo "==> $(date -Iseconds) auto-deploy homolog"
  "$deploy" homolog
} >>"$log" 2>&1 || true

exit 0
