#!/usr/bin/env bash
#
# ZIP genérico da dist/ para a Luminous Store (um pacote por versão).
# Não assina por root_url — pack:private continua só para entrega manual.
#
# Uso (na raiz do repositório):
#   npm run pack:store
#   SKIP_BUILD=1 ./packaging/build-store-zip.sh   # reusa dist/ já compilado
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLUGIN_ID="luminous-topology-panel"
VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="${ROOT}/packaging/out"
STAGE="${OUT_DIR}/${PLUGIN_ID}"
ZIP_NAME="${PLUGIN_ID}-${VERSION}.zip"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "==> npm run build"
  npm run build
fi

if [[ ! -f dist/module.js ]]; then
  echo "dist/module.js não existe — rode npm run build ou omita SKIP_BUILD=1." >&2
  exit 1
fi
if [[ ! -f dist/gpx_topology_linux_amd64 ]]; then
  echo "dist/gpx_topology_linux_amd64 não existe — o ZIP da loja precisa do backend Go." >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$STAGE"
cp -a dist/. "$STAGE/"
# ZIP da loja não leva assinatura privada (outro root_url).
rm -f "$STAGE/MANIFEST.txt"

(
  cd "$OUT_DIR"
  if command -v zip >/dev/null 2>&1; then
    zip -qr "$ZIP_NAME" "$PLUGIN_ID"
  else
    python3 - "$PLUGIN_ID" "$ZIP_NAME" <<'PY'
import sys, zipfile
from pathlib import Path
folder, zip_name = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as archive:
    root = Path(folder)
    for path in root.rglob('*'):
        if path.is_file():
            archive.write(path, path.as_posix())
PY
  fi
)
rm -rf "$STAGE"

echo "==> ZIP: ${OUT_DIR}/${ZIP_NAME}"
echo "    Anexe este arquivo no GitHub Release. Não use pack:private na loja."
