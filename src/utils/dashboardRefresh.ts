import { locationService } from '@grafana/runtime';

/** Converte valor de refresh do Grafana ("5s", "1m", "off") em segundos. */
export function parseGrafanaRefreshSeconds(raw: unknown): number | null {
  if (raw == null || raw === false || raw === '' || raw === 'false') {
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'off' || s === 'false') {
    return null;
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  const unit = (m[2] || 's').toLowerCase();
  if (unit === 'ms') {
    return Math.max(1, Math.round(n / 1000));
  }
  if (unit === 's') {
    return Math.max(1, Math.round(n));
  }
  if (unit === 'm') {
    return Math.max(1, Math.round(n * 60));
  }
  if (unit === 'h') {
    return Math.max(1, Math.round(n * 3600));
  }
  return null;
}

/** Lê o auto-refresh atual do dashboard (URL ?refresh=…). */
export function readDashboardRefreshSeconds(): number | null {
  try {
    return parseGrafanaRefreshSeconds(locationService.getSearchObject().refresh);
  } catch {
    return null;
  }
}
