#!/usr/bin/env bash
#
# Compila o backend Go do plugin para as plataformas que o Grafana carrega.
# Roda depois do webpack — o clean da dist/ apagaria os binários se viesse antes.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v go >/dev/null 2>&1; then
  echo "Go é necessário para o backend (golang.org, 1.22+)." >&2
  exit 1
fi

OUT="${BACKEND_OUT:-dist}"
mkdir -p "$OUT"

export CGO_ENABLED=0

build_one() {
  local goos="$1" goarch="$2" suffix="${3:-}"
  echo "==> backend ${goos}/${goarch}"
  GOOS="$goos" GOARCH="$goarch" go build -trimpath -ldflags='-s -w' \
    -o "${OUT}/gpx_topology_${goos}_${goarch}${suffix}" ./pkg
}

build_one linux amd64
build_one linux arm64
build_one darwin amd64
build_one darwin arm64
build_one windows amd64 ".exe"
chmod +x "${OUT}"/gpx_topology_* 2>/dev/null || true
