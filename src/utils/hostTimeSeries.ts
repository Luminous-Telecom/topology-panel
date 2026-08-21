import { DataFrame, Field, FieldType, PanelData, TimeRange } from '@grafana/data';
import { HostMetadataMap, TopologyHostStatus } from '../types';
import { collectHostLookupCandidates, HostLookupRef } from './hostLookup';
import { hostLabelFromField } from '../services/queryIndex';
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

function fieldItemKey(field: Field): string {
  return String(field.labels?.item_key ?? field.labels?.key_ ?? '')
    .trim()
    .toLowerCase();
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

/** Métrica ICMP detectada pelos item_key das séries da Query (sem opções do painel). */
function effectiveHoverMetric(data?: PanelData, displayQueryRefIds: string[] = []): TopologyHoverMetric {
  const allowed =
    displayQueryRefIds.length > 0
      ? new Set(displayQueryRefIds.map((refId) => refId.trim().toUpperCase()).filter(Boolean))
      : undefined;

  for (const frame of data?.series ?? []) {
    if (!frameMatchesDisplayQuery(frame, allowed)) {
      continue;
    }
    for (const field of frame.fields ?? []) {
      const key = fieldItemKey(field);
      if (key.includes('icmppingloss')) {
        return 'packet_loss';
      }
      if (key.includes('icmppingsec') || key === 'icmpping') {
        return 'icmp_rtt';
      }
    }
  }
  return 'icmp_rtt';
}

function fieldMatchesIcmpMetric(field: Field, metric: TopologyHoverMetric): boolean {
  const key = fieldItemKey(field);
  if (!key) {
    return true;
  }
  if (metric === 'packet_loss') {
    return key.includes('icmppingloss');
  }
  return key.includes('icmppingsec') || key.includes('icmpping');
}

function frameMatchesDisplayQuery(frame: DataFrame, allowedRefIds?: Set<string>): boolean {
  if (!allowedRefIds || allowedRefIds.size === 0) {
    return true;
  }
  const refId = frame.refId?.trim().toUpperCase();
  return Boolean(refId && allowedRefIds.has(refId));
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
  const itemKey = fieldItemKey(field);
  if (itemKey) {
    return itemKey;
  }
  return 'ICMP';
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
  statusOptions: StatusColorOptions
): HostTimeSeriesPoint[] {
  const points: HostTimeSeriesPoint[] = [];
  const times: ArrayLike<unknown> = timeField.values;
  const values: ArrayLike<unknown> = valueField.values;
  const len = values.length;
  for (let i = 0; i < len; i++) {
    const t = timestampMs(times[i]);
    const rawV = values[i];
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
      status: resolveHostStatusFromValue(value, statusOptions.statusValueMappings),
    });
  }
  return points;
}

function timeRangeBoundsMs(range: TimeRange): { fromMs: number; toMs: number } {
  return {
    fromMs: range.from.valueOf(),
    toMs: range.to.valueOf(),
  };
}

function filterPointsToTimeRange(points: HostTimeSeriesPoint[], range?: TimeRange): HostTimeSeriesPoint[] {
  if (!range) {
    return points;
  }
  const { fromMs, toMs } = timeRangeBoundsMs(range);
  const filtered = points.filter((point) => point.t >= fromMs && point.t <= toMs);
  return filtered.length ? filtered : points;
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
    points,
    metric,
    fieldLabel,
    failureCount,
    lastFailureAt,
  };
}

/** Série ICMP/perda da Query Zabbix para um host (refIds opt-in + intervalo do dashboard). */
export function extractHostHoverSeries(
  data: PanelData | undefined,
  ref: HostLookupRef,
  metadata: HostMetadataMap | undefined,
  displayQueryRefIds: string[],
  statusOptions: StatusColorOptions
): HostHoverSeries | undefined {
  if (!data?.series?.length) {
    return undefined;
  }

  const candidates = new Set(collectHostLookupCandidates(ref, metadata));
  if (!candidates.size) {
    return undefined;
  }

  const allowedRefIds =
    displayQueryRefIds.length > 0
      ? new Set(displayQueryRefIds.map((refId) => refId.trim().toUpperCase()).filter(Boolean))
      : undefined;
  const metric = effectiveHoverMetric(data, displayQueryRefIds);

  let bestPoints: HostTimeSeriesPoint[] = [];
  let bestLabel = hoverMetricLabel(metric);

  for (const frame of data.series) {
    if (!frameMatchesDisplayQuery(frame, allowedRefIds)) {
      continue;
    }
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
      if (!fieldMatchesIcmpMetric(field, metric)) {
        continue;
      }
      const points = readPoints(timeField, field, statusOptions);
      if (points.length > bestPoints.length) {
        bestPoints = points;
        bestLabel = fieldSeriesLabel(field);
      }
    }
  }

  if (!bestPoints.length) {
    return undefined;
  }

  const sorted = [...filterPointsToTimeRange(bestPoints, data.timeRange)].sort((a, b) => a.t - b.t);
  return summarizeHoverSeries(sorted, metric, bestLabel);
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
