#!/usr/bin/env bash
#
# Desenvolvimento local: webpack em watch (JS, sem minify) + rebuild do backend
# Go só da plataforma desta máquina, direto na pasta do Grafana.
#
# Uso: npm run dev
# JS: recarregue o dashboard (F5). Go: o watcher recompila e recicla o processo do plugin.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLUGIN_ID="luminous-topology-panel"
PLUGIN_DIR="${GRAFANA_PLUGIN_DIR:-/var/lib/grafana/plugins/${PLUGIN_ID}}"
export GRAFANA_PLUGIN_DIR="$PLUGIN_DIR"

if [[ ! -x "$ROOT/node_modules/.bin/webpack" ]]; then
  echo "Rode npm install antes de npm run dev." >&2
  exit 1
fi
if ! command -v go >/dev/null 2>&1; then
  echo "Go é necessário para o backend (golang.org, 1.22+)." >&2
  exit 1
fi

mkdir -p "$PLUGIN_DIR"

GOOS="$(go env GOOS)"
GOARCH="$(go env GOARCH)"
SUFFIX=""
if [[ "$GOOS" == windows ]]; then
  SUFFIX=".exe"
fi
BACKEND_NAME="gpx_topology_${GOOS}_${GOARCH}${SUFFIX}"
BACKEND_DEST="${PLUGIN_DIR}/${BACKEND_NAME}"

FRONT_PID=""
BACK_PID=""

cleanup() {
  if [[ -n "${FRONT_PID}" ]]; then
    kill "${FRONT_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACK_PID}" ]]; then
    kill "${BACK_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

src_stamp() {
  find pkg -name '*.go' -print 2>/dev/null | sort | while IFS= read -r file; do
    if stat -c '%Y %n' "$file" >/dev/null 2>&1; then
      stat -c '%Y %n' "$file"
    else
      stat -f '%m %N' "$file"
    fi
  done
  for extra in go.mod go.sum; do
    if [[ -f "$extra" ]]; then
      if stat -c '%Y %n' "$extra" >/dev/null 2>&1; then
        stat -c '%Y %n' "$extra"
      else
        stat -f '%m %N' "$extra"
      fi
    fi
  done
}

recycle_plugin_process() {
  pkill -f "${BACKEND_DEST}" >/dev/null 2>&1 || true
  sleep 0.2
}

build_backend() {
  local tmp="${BACKEND_DEST}.tmp.$$"
  echo "==> backend ${GOOS}/${GOARCH}"
  CGO_ENABLED=0 go build -o "$tmp" ./pkg
  recycle_plugin_process
  mv -f "$tmp" "$BACKEND_DEST"
  chmod +x "$BACKEND_DEST"
  echo "==> backend em ${BACKEND_DEST}"
}

watch_backend() {
  local last current
  last="$(src_stamp)"
  while true; do
    sleep 1
    current="$(src_stamp)"
    if [[ "$current" != "$last" ]]; then
      last="$current"
      if ! build_backend; then
        echo "==> backend: compilação falhou" >&2
      fi
    fi
  done
}

build_backend

echo "==> JS + Go em watch → ${PLUGIN_DIR}"
echo "    JS: F5 no dashboard. Go: o processo do plugin recicla após cada save em pkg/."

watch_backend &
BACK_PID=$!

"$ROOT/node_modules/.bin/webpack" -w -c "$ROOT/.config/webpack/webpack.config.js" --env development &
FRONT_PID=$!

wait "$FRONT_PID"
