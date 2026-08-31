import pluginMeta from '../plugin.json';

/** Versão gravada em `plugin.json` — a que o Grafana e a loja devem mostrar. */
export const PLUGIN_VERSION: string = pluginMeta.info.version;

export function parsePluginVersion(value: string | null | undefined): [number, number, number] | undefined {
  const raw = (value ?? '').trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True se `latest` (loja) é maior que a versão instalada neste Grafana. */
export function pluginVersionIsNewer(latest: string, installed: string): boolean {
  const a = parsePluginVersion(latest);
  const b = parsePluginVersion(installed);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) {
      return false;
    }
    if (left !== right) {
      return left > right;
    }
  }
  return false;
}
