import { HostDisplayInfo } from '../types';
import { HostTimeSeriesPoint } from './hostTimeSeries';
import { resolveHostStatusDisplay, StatusColorOptions } from './statusMapping';

const overlayByKey = new Map<string, HostDisplayInfo>();
const listeners = new Set<() => void>();

function notifyHostDisplayOverlay(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Re-render do mapa quando o hover atualiza status a partir do histórico ICMP. */
export function subscribeHostDisplayOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Limpa overlays após refresh do índice Zabbix direto. */
export function clearHostDisplayOverlay(): void {
  overlayByKey.clear();
  notifyHostDisplayOverlay();
}

/** Atualiza status derivado do histórico ICMP (hover) quando mais recente que o índice. */
export function applyHostDisplayOverlayFromHoverPoint(
  keys: string[],
  point: HostTimeSeriesPoint,
  statusOptions: StatusColorOptions
): void {
  const resolved = resolveHostStatusDisplay(point.value, statusOptions);
  if (!resolved) {
    return;
  }
  const info: HostDisplayInfo = {
    value: point.value,
    color: resolved.color,
    text: resolved.text,
    status: resolved.status,
    updatedAtSec: Math.floor(point.t / 1000),
  };
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed) {
      continue;
    }
    overlayByKey.set(trimmed, info);
    overlayByKey.set(trimmed.toLowerCase(), info);
  }
  notifyHostDisplayOverlay();
}

export function lookupHostDisplayOverlay(key: string): HostDisplayInfo | undefined {
  const trimmed = key.trim();
  if (!trimmed) {
    return undefined;
  }
  return overlayByKey.get(trimmed) ?? overlayByKey.get(trimmed.toLowerCase());
}
