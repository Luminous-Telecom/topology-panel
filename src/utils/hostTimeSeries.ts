import { Field, FieldType, PanelData } from '@grafana/data';
import { HostMetadataMap, TopologyStatusMetric } from '../types';
import {
  collectHostLookupCandidates,
  effectiveStatusMetric,
  HostLookupRef,
  offlineThresholdForMetric,
  resolveStatusFromValue,
} from '../utils';

export const HOST_HOVER_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface HostTimeSeriesPoint {
  t: number;
  value: number;
  status: 'online' | 'offline';
}

export interface HostHoverSeries {
  points: HostTimeSeriesPoint[];
  metric: TopologyStatusMetric;
  failureCount: number;
  lastFailureAt?: number;
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

function fieldMatchesMetric(field: Field, metric: TopologyStatusMetric): boolean {
  const key = String(field.labels?.item_key ?? field.labels?.key_ ?? '')
    .trim()
    .toLowerCase();
  if (!key) {
    return true;
  }
  if (metric === 'packet_loss') {
    return key.includes('icmppingloss');
  }
  return key.includes('icmppingsec') || key.includes('icmpping');
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

function readPoints(
  timeField: Field,
  valueField: Field,
  metric: TopologyStatusMetric,
  threshold: number
): HostTimeSeriesPoint[] {
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
    points.push({
      t,
      value,
      status: resolveStatusFromValue(value, threshold, metric),
    });
  }
  return points;
}

function filterPointsToHoverWindow(points: HostTimeSeriesPoint[]): HostTimeSeriesPoint[] {
  const cutoff = Date.now() - HOST_HOVER_PERIOD_MS;
  const filtered = points.filter((point) => point.t >= cutoff);
  return filtered.length ? filtered : points;
}

export function summarizeHostHoverSeries(
  points: HostTimeSeriesPoint[],
  metric: TopologyStatusMetric
): HostHoverSeries | undefined {
  if (!points.length) {
    return undefined;
  }

  const sorted = [...points].sort((a, b) => a.t - b.t);
  let failureCount = 0;
  let lastFailureAt: number | undefined;
  for (const point of sorted) {
    if (point.status === 'offline') {
      failureCount += 1;
      lastFailureAt = point.t;
    }
  }

  return {
    points: sorted,
    metric,
    failureCount,
    lastFailureAt,
  };
}

/** Série temporal ICMP/perda da Query Zabbix para um host (janela de até 24h). */
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

  const metric = effectiveStatusMetric(undefined, data);
  const threshold = offlineThresholdForMetric(metric);
  let bestPoints: HostTimeSeriesPoint[] = [];

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
      if (!fieldMatchesMetric(field, metric)) {
        continue;
      }
      const points = readPoints(timeField, field, metric, threshold);
      if (points.length > bestPoints.length) {
        bestPoints = points;
      }
    }
  }

  if (!bestPoints.length) {
    return undefined;
  }

  return summarizeHostHoverSeries(filterPointsToHoverWindow(bestPoints), metric);
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

export function formatHoverMetricValue(metric: TopologyStatusMetric, value: number): string {
  if (metric === 'packet_loss') {
    return `${value.toFixed(1)}%`;
  }
  if (value <= 0) {
    return 'sem resposta';
  }
  return `${(value * 1000).toFixed(1)} ms`;
}

export function hoverMetricLabel(metric: TopologyStatusMetric): string {
  return metric === 'packet_loss' ? 'Perda ICMP' : 'Latência ICMP';
}
