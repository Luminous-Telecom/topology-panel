import { UrlQueryMap } from '@grafana/data';
import { chromeContainsSelector } from './grafanaChromeObserve';

/**
 * Query params that Grafana's PlaylistSrv keeps across dashboard rotations
 * (`kiosk`, `autofitpanels`, `_dash.hide*`). Presence means presentation /
 * playlist playback — not a normal interactive dashboard view.
 */
const PLAYLIST_SEARCH_KEYS = [
  'kiosk',
  'autofitpanels',
  'hideLogo',
  '_dash.hideTimePicker',
  '_dash.hideVariables',
  '_dash.hideLinks',
  '_dash.hidePlaylistNav',
] as const;

/**
 * Botões nativos da playlist no chrome do Grafana. O runtime do plugin não
 * expõe `playlistSrv` — mesmo motivo da exceção em `useDashboardEditMode`.
 */
const PLAYLIST_CONTROL_SELECTORS = [
  '[data-testid="data-testid playlist stop dashboard button"]',
  '[data-testid="data-testid playlist previous dashboard button"]',
  '[data-testid="data-testid playlist next dashboard button"]',
  'button[aria-label="Stop playlist"]',
  'button[aria-label="Parar playlist"]',
];

/** Interpreta flag de query string do Grafana (`?kiosk`, `kiosk=tv`, `true`/`1`). */
export function isTruthyUrlFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value === false || value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => isTruthyUrlFlag(item));
  }
  const s = String(value).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'off') {
    return false;
  }
  return true;
}

/** True quando a URL indica playlist / kiosk / autofit (modo apresentação). */
export function searchIndicatesPlaylistPlayback(search: UrlQueryMap): boolean {
  return PLAYLIST_SEARCH_KEYS.some((key) => isTruthyUrlFlag(search[key]));
}

/** True quando os controles nativos da playlist estão no documento. */
export function documentHasPlaylistControls(root?: ParentNode | null): boolean {
  return chromeContainsSelector(root, PLAYLIST_CONTROL_SELECTORS);
}
