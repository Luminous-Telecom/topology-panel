import { PanelData, TimeRange } from '@grafana/data';
import { HostMetadataMap, TopologyHostStatus } from '../types';
import { collectHostLookupCandidates, HostLookupRef } from './hostLookup';
import { resolveHostStatusFromValue, StatusColorOptions } from './statusMapping';

export type TopologyHoverMetric = 'icmp_rtt' | 'packet_loss';

export interface HostTimeSeriesPoint {
  t: number;
  value: number;
  displayText?: string;
  status?: TopologyHostStatus;
}

export interface HostHoverSeries {
  points: HostTimeSeriesPoint[];
  metric: TopologyHoverMetric;
  fieldLabel: string;
  failureCount: number;
  lastFailureAt?: number;
}

export type HostHoverSeriesMap = Record<string, HostHoverSeries>;

/** Série do poll de status — o hover não consulta o Zabbix. */
export function lookupHostHoverSeries(
  byHost: HostHoverSeriesMap | undefined,
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): HostHoverSeries | undefined {
  if (!byHost) {
    return undefined;
  }
  for (const name of collectHostLookupCandidates(ref, metadata)) {
    const series = byHost[name] ?? byHost[name.toLowerCase()];
    if (series) {
      return series;
    }
  }
  return undefined;
}

function timeRangeBoundsMs(range: TimeRange): { fromMs: number; toMs: number } {
  return {
    fromMs: range.from.valueOf(),
    toMs: range.to.valueOf(),
  };
}

export function hoverMetricFromItemKey(itemKey: string): TopologyHoverMetric {
  const key = itemKey.trim().toLowerCase();
  if (key.includes('icmppingloss')) {
    return 'packet_loss';
  }
  return 'icmp_rtt';
}

export function buildHostHoverSeriesFromZabbixHistory(
  rawPoints: Array<{ clockSec: number; value: number }>,
  itemKey: string,
  fieldLabel: string,
  statusOptions: StatusColorOptions
): HostHoverSeries | undefined {
  if (!rawPoints.length) {
    return undefined;
  }
  const metric = hoverMetricFromItemKey(itemKey);
  const points: HostTimeSeriesPoint[] = rawPoints
    .map(({ clockSec, value }) => ({
      t: clockSec * 1000,
      value,
      status: resolveHostStatusFromValue(value, statusOptions.statusValueMappings),
    }))
    .sort((a, b) => a.t - b.t);
  return summarizeHoverSeries(points, metric, fieldLabel);
}

/** Pontos no sparkline — um por coluna de pixel, mais folga para falhas ICMP. */
export const HOVER_SPARKLINE_MAX_POINTS = 240;

/**
 * Reduz a série para o sparkline sem perder falha ICMP.
 *
 * Em cada fatia de tempo fica o ponto offline se houver; senão o último da fatia (o "Agora" da
 * última coluna). A contagem de falhas **não** passa por aqui — `summarizeHoverSeries` conta na
 * série completa antes de compactar.
 */
export function compactHoverPoints(
  points: HostTimeSeriesPoint[],
  maxPoints: number = HOVER_SPARKLINE_MAX_POINTS
): HostTimeSeriesPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const span = Math.max(last.t - first.t, 1);
  const slots: Array<HostTimeSeriesPoint | undefined> = new Array(maxPoints);
  for (const point of points) {
    const idx = Math.min(maxPoints - 1, Math.max(0, Math.floor(((point.t - first.t) / span) * maxPoints)));
    const prev = slots[idx];
    if (!prev) {
      slots[idx] = point;
      continue;
    }
    if (point.status === 'offline' && prev.status !== 'offline') {
      slots[idx] = point;
      continue;
    }
    if (point.t >= prev.t && (point.status === 'offline' || prev.status !== 'offline')) {
      slots[idx] = point;
    }
  }
  const compacted: HostTimeSeriesPoint[] = [];
  for (const slot of slots) {
    if (slot) {
      compacted.push(slot);
    }
  }
  if (compacted[compacted.length - 1] !== last) {
    compacted.push(last);
  }
  return compacted;
}

function summarizeHoverSeries(
  points: HostTimeSeriesPoint[],
  metric: TopologyHoverMetric,
  fieldLabel: string
): HostHoverSeries {
  let failureCount = 0;
  let lastFailureAt: number | undefined;
  for (const point of points) {
    if (point.status === 'offline') {
      failureCount += 1;
      lastFailureAt = point.t;
    }
  }
  return {
    points: compactHoverPoints(points),
    metric,
    fieldLabel,
    failureCount,
    lastFailureAt,
  };
}

function formatHoverClock(ts: number, spanMs: number): string {
  if (spanMs > 24 * 60 * 60 * 1000) {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Com `skipDataQuery`, `data.timeRange` é o default do Grafana (`now-6h`), não o relógio do
 * dashboard. O intervalo do seletor está em `PanelProps.timeRange`.
 */
export function panelDataWithDashboardTimeRange(data: PanelData, timeRange: TimeRange): PanelData {
  return data.timeRange === timeRange ? data : { ...data, timeRange };
}

function dashboardTimeRangeLabel(timeRange: TimeRange): string {
  const fromRaw = timeRange.raw.from;
  const toRaw = timeRange.raw.to;
  if (typeof fromRaw === 'string' && fromRaw.startsWith('now')) {
    const toPart = typeof toRaw === 'string' ? toRaw : 'now';
    return `${fromRaw} → ${toPart}`;
  }
  const spanMs = timeRange.to.valueOf() - timeRange.from.valueOf();
  const clock = (ts: number) => formatHoverClock(ts, spanMs);
  return `${clock(timeRange.from.valueOf())} – ${clock(timeRange.to.valueOf())}`;
}

export function hostHoverPeriodLabel(series?: HostHoverSeries, timeRange?: TimeRange): string {
  const points = series?.points;
  const spanMs =
    points && points.length >= 2
      ? points[points.length - 1].t - points[0].t
      : timeRange
        ? timeRange.to.valueOf() - timeRange.from.valueOf()
        : 0;
  const clock = (ts: number) => formatHoverClock(ts, spanMs);

  if (timeRange) {
    const rangeLabel = dashboardTimeRangeLabel(timeRange);
    if (points && points.length >= 1) {
      return `${rangeLabel} · ${clock(points[0].t)} – ${clock(points[points.length - 1].t)}`;
    }
    const { fromMs, toMs } = timeRangeBoundsMs(timeRange);
    return `${rangeLabel} · ${clock(fromMs)} – ${clock(toMs)}`;
  }

  if (points && points.length >= 1) {
    return `${clock(points[0].t)} – ${clock(points[points.length - 1].t)}`;
  }

  return 'Período do dashboard';
}

function formatHoverMetricValue(metric: TopologyHoverMetric, value: number): string {
  if (metric === 'packet_loss') {
    return `${value.toFixed(1)}%`;
  }
  if (value <= 0) {
    return 'sem resposta';
  }
  return `${(value * 1000).toFixed(1)} ms`;
}

export function hoverMetricLabel(metric: TopologyHoverMetric): string {
  return metric === 'packet_loss' ? 'Perda ICMP' : 'Latência ICMP';
}

export function formatHoverFieldValue(point: HostTimeSeriesPoint, metric: TopologyHoverMetric): string {
  if (point.displayText?.trim()) {
    return point.displayText.trim();
  }
  return formatHoverMetricValue(metric, point.value);
}
