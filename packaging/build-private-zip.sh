#!/usr/bin/env bash
#
# Gera ZIP de plugin Grafana **privado**, assinado só para o(s) root_url informado(s).
# O Grafana recusa o plugin em instância cujo root_url não esteja no MANIFEST.txt.
#
# Uso:
#   export GRAFANA_ACCESS_POLICY_TOKEN='...'   # Grafana Cloud, scope plugins:write
#   ./packaging/build-private-zip.sh https://grafana.cliente.example
#   ./packaging/build-private-zip.sh http://10.0.0.1:3000
#   ./packaging/build-private-zip.sh 10.0.0.1:3000   # vira http://10.0.0.1:3000
#
# O token e o host do cliente não entram no git. SKIP_BUILD=1 reusa dist/ já compilado.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLUGIN_ID="luminous-topology-panel"
VERSION="$(node -p "require('./package.json').version")"
ROOT_URLS="${1:-}"

usage() {
  echo "Uso: $0 <root_url>[,root_url...]" >&2
  echo "Exemplo: $0 https://grafana.cliente.example" >&2
  echo "         $0 http://10.0.0.1:3000" >&2
  echo "         $0 10.0.0.1:3000" >&2
  echo "Defina GRAFANA_ACCESS_POLICY_TOKEN (Grafana Cloud, plugins:write)." >&2
  exit 1
}

if [[ -z "$ROOT_URLS" || "$ROOT_URLS" == "-h" || "$ROOT_URLS" == "--help" ]]; then
  usage
fi

if [[ -z "${GRAFANA_ACCESS_POLICY_TOKEN:-}" ]]; then
  echo "Defina GRAFANA_ACCESS_POLICY_TOKEN (Grafana Cloud, scope plugins:write)." >&2
  echo "https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin#sign-a-private-plugin" >&2
  exit 1
fi

IFS=',' read -r -a RAW_URLS <<< "$ROOT_URLS"
CLEAN_URLS=()
for url in "${RAW_URLS[@]}"; do
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"
  # IP puro ou IP:porta — o Grafana exige URL completa (igual ao root_url / barra do navegador).
  if [[ "$url" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?$ ]]; then
    url="http://${url}"
  fi
  if [[ "$url" != http://* && "$url" != https://* ]]; then
    echo "root_url inválido (use http:// ou https://): ${url}" >&2
    exit 1
  fi
  if [[ "$url" == *" "* || "$url" == *@* ]]; then
    echo "root_url não pode conter espaço, usuário ou senha: ${url}" >&2
    exit 1
  fi
  CLEAN_URLS+=("$url")
done
ROOT_URLS="$(IFS=','; printf '%s' "${CLEAN_URLS[*]}")"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "==> npm run build"
  npm run build
fi

if [[ ! -f dist/module.js ]]; then
  echo "dist/module.js não existe — rode npm run build ou omita SKIP_BUILD=1." >&2
  exit 1
fi

cp -f README.md LICENSE EULA.md dist/

echo "==> Assinando plugin privado (rootUrls=${ROOT_URLS})"
npx --yes @grafana/sign-plugin@latest --rootUrls "${ROOT_URLS}"

FIRST_HOST="${CLEAN_URLS[0]}"
FIRST_HOST="${FIRST_HOST#http://}"
FIRST_HOST="${FIRST_HOST#https://}"
FIRST_HOST="${FIRST_HOST%%/*}"
SLUG="${FIRST_HOST//[^A-Za-z0-9._-]/}"
OUT_DIR="${ROOT}/packaging/out"
STAGE="${OUT_DIR}/${PLUGIN_ID}"
ZIP_NAME="${PLUGIN_ID}-${VERSION}-${SLUG}.zip"

rm -rf "$OUT_DIR"
mkdir -p "$STAGE"
cp -a dist/. "$STAGE/"

(
  cd "$OUT_DIR"
  zip -qr "$ZIP_NAME" "$PLUGIN_ID"
)
rm -rf "$STAGE"

echo "==> ZIP: ${OUT_DIR}/${ZIP_NAME}"
echo "    Instale a pasta ${PLUGIN_ID}/ (ou o ZIP extraído) em plugins/ do Grafana cujo root_url seja exatamente o informado."
echo "    Entregue também EULA.md. A Licenciada não pode redistribuir este ZIP."
