import { createTheme, GrafanaTheme2 } from '@grafana/data';
import { config } from '@grafana/runtime';
import { TopologyPanelOptions } from '../types';

export const PANEL_COLOR_OPTION_KEYS = [
  'colorUnknown',
  'colorStatic',
  'colorSubmap',
  'colorLink',
  'colorLinkDownload',
  'colorLinkUpload',
  'colorNetworkFill',
  'colorNetworkBorder',
  'colorNetworkLabel',
] as const satisfies ReadonlyArray<keyof TopologyPanelOptions>;

function isCssColor(value: string): boolean {
  const v = value.trim();
  return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl');
}

function rawColorString(color: unknown): string {
  if (color == null) {
    return '';
  }
  if (typeof color === 'object') {
    const obj = color as { fixedColor?: string; color?: string; value?: string };
    for (const key of ['fixedColor', 'color', 'value'] as const) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
    return '';
  }
  return String(color).trim();
}

function themesToTry(primary: GrafanaTheme2): GrafanaTheme2[] {
  const out: GrafanaTheme2[] = [];
  const push = (theme?: GrafanaTheme2) => {
    if (theme && !out.includes(theme)) {
      out.push(theme);
    }
  };
  push(primary);
  push(config.theme2);
  push(createTheme({ colors: { mode: primary.isDark ? 'dark' : 'light' } }));
  return out;
}

/** Resolve nome da paleta Grafana usando o tema ativo e temas oficiais do Grafana. */
function resolveNamedColor(theme: GrafanaTheme2, name: string): string {
  for (const candidate of themesToTry(theme)) {
    const viz = candidate.visualization;
    if (!viz) {
      continue;
    }
    for (const hue of viz.hues ?? []) {
      for (const shade of hue.shades ?? []) {
        if (shade.name === name) {
          return shade.color;
        }
        if (shade.aliases?.includes(name)) {
          return shade.color;
        }
      }
    }
    const fromTheme = viz.getColorByName?.(name);
    if (fromTheme && fromTheme !== name && isCssColor(fromTheme)) {
      return fromTheme;
    }
  }
  return '';
}

/**
 * Converte cor do painel para valor CSS válido em SVG.
 * Hex/rgb passam direto; nomes Grafana (ex.: light-green) resolvem via tema.
 * Nunca retorna nome de tema — SVG não reconhece e pinta preto.
 */
export function resolvePanelColor(theme: GrafanaTheme2, color?: unknown): string {
  const raw = rawColorString(color);
  if (!raw) {
    return '';
  }
  if (isCssColor(raw)) {
    return raw;
  }
  return resolveNamedColor(theme, raw);
}

/** Resolve cores das opções antes de renderizar SVG. */
export function resolvePanelOptionsColors(
  options: TopologyPanelOptions,
  theme: GrafanaTheme2
): TopologyPanelOptions {
  const resolve = (color: string) => resolvePanelColor(theme, color);
  return {
    ...options,
    colorUnknown: resolve(options.colorUnknown),
    colorStatic: resolve(options.colorStatic),
    colorSubmap: resolve(options.colorSubmap),
    colorLink: resolve(options.colorLink),
    colorLinkDownload: resolve(options.colorLinkDownload),
    colorLinkUpload: resolve(options.colorLinkUpload),
    colorNetworkFill: resolve(options.colorNetworkFill),
    colorNetworkBorder: resolve(options.colorNetworkBorder),
    colorNetworkLabel: resolve(options.colorNetworkLabel),
  };
}

/** Converte nomes Grafana salvos nas opções para hex (persiste no dashboard). */
export function normalizeStoredPanelColors(
  options: TopologyPanelOptions,
  theme: GrafanaTheme2
): { options: TopologyPanelOptions; changed: boolean } {
  const resolved = resolvePanelOptionsColors(options, theme);
  const patch: Partial<TopologyPanelOptions> = {};
  let changed = false;

  for (const key of PANEL_COLOR_OPTION_KEYS) {
    const raw = String(options[key] ?? '').trim();
    const fixed = String(resolved[key] ?? '').trim();
    if (!raw || !fixed || raw === fixed) {
      continue;
    }
    if (!isCssColor(raw) && isCssColor(fixed)) {
      patch[key] = fixed;
      changed = true;
    }
  }

  return {
    options: changed ? { ...options, ...patch } : options,
    changed,
  };
}
