import { createTheme, GrafanaTheme2 } from '@grafana/data';
import { config } from '@grafana/runtime';
import { TopologyHostIcon, TopologyPanelOptions } from '../types';

const PANEL_COLOR_OPTION_KEYS = [
  'colorOnline',
  'colorOffline',
  'colorAlert',
  'colorUnknown',
  'colorStatic',
  'colorSubmap',
  'colorLink',
  'colorLinkDownload',
  'colorLinkUpload',
  'colorNetworkFill',
  'colorNetworkBorder',
] as const satisfies ReadonlyArray<keyof TopologyPanelOptions>;

function isCssColor(value: string): boolean {
  const v = value.trim();
  return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl');
}

/** hsl() do color picker → hex, para SVG e contraste de texto. */
function hslToHex(raw: string): string {
  const m = raw.trim().match(/^hsla?\(\s*([\d.]+)\s*(?:,\s*|\s+)([\d.]+)%\s*(?:,\s*|\s+)([\d.]+)%/i);
  if (!m) {
    return '';
  }
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const toHex = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
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
  if (raw.startsWith('hsl')) {
    const hex = hslToHex(raw);
    if (hex) {
      return hex;
    }
  }
  if (isCssColor(raw)) {
    return raw;
  }
  return resolveNamedColor(theme, raw);
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | undefined {
  const raw = hex.trim();
  if (!raw.startsWith('#')) {
    return undefined;
  }
  const h = raw.slice(1);
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return undefined;
}

/** Converte cor hex do painel em rgba para preenchimentos translúcidos de rede. */
export function panelColorWithAlpha(color: string, alpha: number): string {
  const rgb = parseHexRgb(color);
  if (!rgb) {
    throw new Error(`Cor do painel inválida para alpha: ${color}`);
  }
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

type HostTypeColors = NonNullable<TopologyPanelOptions['hostTypeColors']>;

function resolveHostTypeColorsMap(
  colors: HostTypeColors | undefined,
  resolve: (color: string) => string
): HostTypeColors | undefined {
  if (!colors) {
    return undefined;
  }
  const out: HostTypeColors = {};
  let any = false;
  for (const [key, value] of Object.entries(colors) as Array<[TopologyHostIcon, string | undefined]>) {
    const raw = String(value ?? '').trim();
    if (!raw) {
      continue;
    }
    const fixed = resolve(raw);
    if (!fixed) {
      continue;
    }
    out[key] = fixed;
    any = true;
  }
  return any ? out : undefined;
}

/** Cor configurada para o tipo/ícone do host (já resolvida para CSS). */
export function hostTypeFillColor(
  icon: TopologyHostIcon | undefined,
  hostTypeColors: HostTypeColors | undefined
): string | undefined {
  if (!icon || !hostTypeColors) {
    return undefined;
  }
  const color = hostTypeColors[icon]?.trim();
  return color || undefined;
}

/** Resolve cores das opções antes de renderizar SVG. */
export function resolvePanelOptionsColors(
  options: TopologyPanelOptions,
  theme: GrafanaTheme2
): TopologyPanelOptions {
  const resolve = (color: string) => resolvePanelColor(theme, color);
  return {
    ...options,
    colorOnline: resolve(options.colorOnline),
    colorOffline: resolve(options.colorOffline),
    colorAlert: resolve(options.colorAlert),
    colorUnknown: resolve(options.colorUnknown),
    colorStatic: resolve(options.colorStatic),
    colorSubmap: resolve(options.colorSubmap),
    colorLink: resolve(options.colorLink),
    colorLinkDownload: resolve(options.colorLinkDownload),
    colorLinkUpload: resolve(options.colorLinkUpload),
    colorNetworkFill: resolve(options.colorNetworkFill),
    colorNetworkBorder: resolve(options.colorNetworkBorder),
    hostTypeColors: resolveHostTypeColorsMap(options.hostTypeColors, resolve),
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

  const rawType = options.hostTypeColors;
  const fixedType = resolved.hostTypeColors;
  if (rawType && fixedType) {
    let typeChanged = false;
    const nextType: HostTypeColors = { ...rawType };
    for (const [key, value] of Object.entries(rawType) as Array<[TopologyHostIcon, string | undefined]>) {
      const raw = String(value ?? '').trim();
      const fixed = String(fixedType[key] ?? '').trim();
      if (!raw || !fixed || raw === fixed) {
        continue;
      }
      if (!isCssColor(raw) && isCssColor(fixed)) {
        nextType[key] = fixed;
        typeChanged = true;
      }
    }
    if (typeChanged) {
      patch.hostTypeColors = nextType;
      changed = true;
    }
  }

  return {
    options: changed ? { ...options, ...patch } : options,
    changed,
  };
}
