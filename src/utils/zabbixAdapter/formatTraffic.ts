/** Formatação de tráfego e utilização de interface. */

import { LinkEndpointRuntimeMetrics, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../../types';

export function formatBitsPerSecond(bps: number | undefined): string | undefined {
  if (bps === undefined || !Number.isFinite(bps) || bps < 0) {
    return undefined;
  }
  if (bps >= 1_000_000_000) {
    const gbps = bps / 1_000_000_000;
    const rounded = gbps >= 10 ? Math.round(gbps * 10) / 10 : Math.round(gbps * 100) / 100;
    return `${rounded} Gbps`;
  }
  if (bps >= 1_000_000) {
    const mbps = bps / 1_000_000;
    return `${Math.round(mbps * 10) / 10} Mbps`;
  }
  if (bps >= 1_000) {
    const kbps = bps / 1_000;
    return `${Math.round(kbps)} Kbps`;
  }
  return `${Math.round(bps)} bps`;
}

/** Uma linha no cabo: TX e RX com unidade real (Mbps/Gbps). */
export function formatLinkMapTrafficLabel(
  txBps: number | undefined,
  rxBps: number | undefined
): string | undefined {
  const tx = formatBitsPerSecond(txBps);
  const rx = formatBitsPerSecond(rxBps);
  if (!tx && !rx) {
    return undefined;
  }
  if (tx && rx) {
    return `↑${tx} ↓${rx}`;
  }
  return tx ? `↑${tx}` : `↓${rx}`;
}

/** Origem: TX depois RX (sai do host). Destino: RX depois TX (entra no host). */
export function formatEndpointTrafficPair(
  rx: string,
  tx: string,
  role: 'from' | 'to'
): { label: string; value: string } {
  if (role === 'from') {
    return { label: 'TX / RX', value: `${tx} / ${rx}` };
  }
  return { label: 'RX / TX', value: `${rx} / ${tx}` };
}

export function computeUtilizationPct(trafficBps: number | undefined, capacityMbps: number | undefined): number | undefined {
  if (
    trafficBps === undefined ||
    capacityMbps === undefined ||
    !Number.isFinite(trafficBps) ||
    !Number.isFinite(capacityMbps) ||
    capacityMbps <= 0
  ) {
    return undefined;
  }
  const capacityBps = capacityMbps * 1_000_000;
  const pct = (trafficBps / capacityBps) * 100;
  if (!Number.isFinite(pct) || pct < 0) {
    return undefined;
  }
  return Math.min(999, Math.round(pct * 10) / 10);
}

export type UtilizationLevel = 'normal' | 'attention' | 'high' | 'critical';

export interface UtilizationThresholds {
  attention: number;
  high: number;
  critical: number;
}

export const DEFAULT_UTILIZATION_THRESHOLDS: UtilizationThresholds = {
  attention: 50,
  high: 75,
  critical: 90,
};

export function classifyUtilization(pct: number | undefined, thresholds = DEFAULT_UTILIZATION_THRESHOLDS): UtilizationLevel | undefined {
  if (pct === undefined || !Number.isFinite(pct)) {
    return undefined;
  }
  if (pct >= thresholds.critical) {
    return 'critical';
  }
  if (pct >= thresholds.high) {
    return 'high';
  }
  if (pct >= thresholds.attention) {
    return 'attention';
  }
  return 'normal';
}

/**
 * Interpreta lastvalue Zabbix de item de tráfego.
 * Templates com preprocessing "Change per second" + multiplier 8 retornam bits/s.
 */
export function parseTrafficLastValue(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }
  return n;
}

/** Zabbix ifOperStatus: 1=up, 2=down, etc. */
export function parseOperStatus(value: number | undefined): 'up' | 'down' | 'adminDown' | 'unknown' {
  if (value === undefined || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value === 1) {
    return 'up';
  }
  if (value === 2) {
    return 'down';
  }
  if (value === 3 || value === 4) {
    return 'adminDown';
  }
  return 'unknown';
}

/** Rótulo do intervalo de busca do plugin — o mesmo ciclo do status e do tráfego. */
export function formatPluginRefreshInterval(
  refreshIntervalSec?: number | null,
  minSec = ZABBIX_DIRECT_MIN_REFRESH_SEC
): string {
  if (refreshIntervalSec == null || refreshIntervalSec <= 0) {
    return 'manual';
  }
  return `a cada ${Math.max(minSec, Math.floor(refreshIntervalSec))}s`;
}

export function formatRelativeUpdate(ms?: number, now = Date.now()): string | undefined {
  if (ms === undefined || !Number.isFinite(ms)) {
    return undefined;
  }
  const deltaSec = Math.max(0, Math.round((now - ms) / 1000));
  if (deltaSec < 60) {
    return `${deltaSec} segundo(s) atrás`;
  }
  const min = Math.round(deltaSec / 60);
  if (min < 60) {
    return `${min} minuto(s) atrás`;
  }
  const hours = Math.round(min / 60);
  return `${hours} hora(s) atrás`;
}

export function linkStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'up':
      return 'UP';
    case 'down':
      return 'DOWN';
    case 'degraded':
      return 'Degradado';
    case 'highUtilization':
      return 'Utilização alta';
    case 'noData':
      return 'Sem dados';
    default:
      return status ?? '—';
  }
}

export function operStatusLabel(status: LinkEndpointRuntimeMetrics['operStatus']): string {
  switch (status) {
    case 'up':
      return 'UP';
    case 'down':
      return 'DOWN';
    case 'adminDown':
      return 'ADM DOWN';
    case 'unknown':
      return 'Desconhecido';
    default:
      return '—';
  }
}

/** Velocidade em bps → Mbps. */
export function speedBpsToMbps(bps: number | undefined): number | undefined {
  if (bps === undefined || !Number.isFinite(bps) || bps <= 0) {
    return undefined;
  }
  return Math.round(bps / 1_000_000);
}
