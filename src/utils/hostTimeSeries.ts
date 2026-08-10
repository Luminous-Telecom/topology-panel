import { Field, FieldType, PanelData } from '@grafana/data';
import { HostMetadataMap } from '../types';
import { collectHostLookupCandidates, HostLookupRef } from '../utils';

export const HOST_HOVER_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface HostTimeSeriesPoint {
  t: number;
  value: number;
  displayText?: string;
}

export interface HostHoverSeries {
  points: HostTimeSeriesPoint[];
  fieldLabel: string;
}

function hostLabelFromField(field: Field): string | undefined {
  const labels = field.labels ?? {};
  const host = labels.host?.trim() || labels.__zbx_host_name?.trim() || labels.hostName?.trim();
  return host || undefined;
}

function fieldMatchesHost(field: Field, candidates: Set<string>): boolean {
  const host = hostLabelFromField(field);
  if (!host) {
    return false;
  }
  if (candidates.has(host)) {
    return true;
  }
  const lower = host.toLowerCase();
  for (const candidate of candidates) {
    if (candidate.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

function fieldSeriesLabel(field: Field): string {
  const configName = field.config?.displayName?.trim();
  if (configName) {
    return configName;
  }
  const labels = field.labels ?? {};
  const itemName = labels.item_name?.trim() || labels.item?.trim();
  if (itemName) {
    return itemName;
  }
  const itemKey = labels.item_key?.trim() || labels.key_?.trim();
  if (itemKey) {
    return itemKey;
  }
  return 'Query';
}

function timestampMs(raw: unknown): number | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readPoints(timeField: Field, valueField: Field): HostTimeSeriesPoint[] {
  const points: HostTimeSeriesPoint[] = [];
  const len = valueField.values.length;
  for (let i = 0; i < len; i++) {
    const t = timestampMs(timeField.values.get(i));
    const rawV = valueField.values.get(i);
    if (t === undefined || rawV == null) {
      continue;
    }
    const value = Number(rawV);
    if (!Number.isFinite(value)) {
      continue;
    }
    const displayed = valueField.display?.(value);
    points.push({
      t,
      value,
      displayText: displayed?.text,
    });
  }
  return points;
}

function filterPointsToHoverWindow(points: HostTimeSeriesPoint[]): HostTimeSeriesPoint[] {
  const cutoff = Date.now() - HOST_HOVER_PERIOD_MS;
  const filtered = points.filter((point) => point.t >= cutoff);
  return filtered.length ? filtered : points;
}

/** Série temporal da Query Zabbix para um host (janela de até 24h). */
export function extractHostHoverSeries(
  data: PanelData | undefined,
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): HostHoverSeries | undefined {
  if (!data?.series?.length) {
    return undefined;
  }

  const candidates = new Set(collectHostLookupCandidates(ref, metadata));
  if (!candidates.size) {
    return undefined;
  }

  let bestPoints: HostTimeSeriesPoint[] = [];
  let bestLabel = 'Query';

  for (const frame of data.series) {
    const timeField = frame.fields.find((field) => field.type === FieldType.time);
    if (!timeField) {
      continue;
    }
    for (const field of frame.fields) {
      if (field.type !== FieldType.number) {
        continue;
      }
      if (!fieldMatchesHost(field, candidates)) {
        continue;
      }
      const points = readPoints(timeField, field);
      if (points.length > bestPoints.length) {
        bestPoints = points;
        bestLabel = fieldSeriesLabel(field);
      }
    }
  }

  if (!bestPoints.length) {
    return undefined;
  }

  const sorted = [...filterPointsToHoverWindow(bestPoints)].sort((a, b) => a.t - b.t);
  return {
    points: sorted,
    fieldLabel: bestLabel,
  };
}

function formatHoverClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function hostHoverPeriodLabel(series?: HostHoverSeries): string {
  const points = series?.points;
  if (points && points.length >= 1) {
    const fromMs = points[0].t;
    const toMs = points[points.length - 1].t;
    return `Últimas 24 horas · ${formatHoverClock(fromMs)} – ${formatHoverClock(toMs)}`;
  }
  const nowMs = Date.now();
  const fromMs = nowMs - HOST_HOVER_PERIOD_MS;
  return `Últimas 24 horas · ${formatHoverClock(fromMs)} – ${formatHoverClock(nowMs)}`;
}

export function formatHoverFieldValue(point: HostTimeSeriesPoint): string {
  if (point.displayText?.trim()) {
    return point.displayText.trim();
  }
  return String(point.value);
}
