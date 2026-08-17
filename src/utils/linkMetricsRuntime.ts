import {
  LinkEndpointRuntimeMetrics,
  LinkRuntimeMetrics,
  LinkRuntimeMetricsMap,
  TopologyInterfaceReference,
  TopologyLink,
  TopologyMap,
  TopologyPanelOptions,
} from '../types';
import { linkKey } from './mapLinkEdits';
import {
  computeUtilizationPct,
  parseOperStatus,
  parseTrafficLastValue,
  speedBpsToMbps,
  UtilizationThresholds,
  DEFAULT_UTILIZATION_THRESHOLDS,
} from './zabbixAdapter/formatTraffic';
import { ZabbixItemLastValue } from './zabbixApi';

function collectItemIdsFromReference(ref?: TopologyInterfaceReference): string[] {
  if (!ref?.metrics) {
    return [];
  }
  const ids: string[] = [];
  const m = ref.metrics;
  if (m.rx?.itemId) {
    ids.push(m.rx.itemId);
  }
  if (m.tx?.itemId) {
    ids.push(m.tx.itemId);
  }
  if (m.operStatus?.itemId) {
    ids.push(m.operStatus.itemId);
  }
  if (m.speed?.itemId) {
    ids.push(m.speed.itemId);
  }
  if (m.errors?.itemId) {
    ids.push(m.errors.itemId);
  }
  if (m.drops?.itemId) {
    ids.push(m.drops.itemId);
  }
  return ids;
}

/** Coleta todos os item IDs de métricas de links do mapa. */
export function collectLinkMetricItemIds(links: TopologyLink[]): string[] {
  const ids = new Set<string>();
  for (const link of links) {
    for (const itemId of collectItemIdsFromReference(link.fromInterface)) {
      ids.add(itemId);
    }
    for (const itemId of collectItemIdsFromReference(link.toInterface)) {
      ids.add(itemId);
    }
  }
  return [...ids];
}

function readItemValue(items: Record<string, ZabbixItemLastValue>, itemId?: string): number | undefined {
  if (!itemId) {
    return undefined;
  }
  return parseTrafficLastValue(items[itemId]?.lastvalue);
}

function readItemClock(items: Record<string, ZabbixItemLastValue>, itemId?: string): number | undefined {
  if (!itemId) {
    return undefined;
  }
  const clock = Number(items[itemId]?.lastclock);
  return Number.isFinite(clock) ? clock * 1000 : undefined;
}

function buildEndpointMetrics(
  ref: TopologyInterfaceReference | undefined,
  items: Record<string, ZabbixItemLastValue>,
  fallbackCapacityMbps?: number
): LinkEndpointRuntimeMetrics {
  if (!ref?.metrics) {
    return { capacityMbps: fallbackCapacityMbps };
  }
  const m = ref.metrics;
  const rxBps = readItemValue(items, m.rx?.itemId);
  const txBps = readItemValue(items, m.tx?.itemId);
  const operRaw = readItemValue(items, m.operStatus?.itemId);
  const speedBps = readItemValue(items, m.speed?.itemId);
  const capacityMbps = speedBpsToMbps(speedBps) ?? fallbackCapacityMbps;
  const errors = readItemValue(items, m.errors?.itemId);
  const drops = readItemValue(items, m.drops?.itemId);
  const clocks = [
    readItemClock(items, m.rx?.itemId),
    readItemClock(items, m.tx?.itemId),
    readItemClock(items, m.operStatus?.itemId),
  ].filter((c): c is number => c !== undefined);
  const lastUpdateMs = clocks.length ? Math.max(...clocks) : undefined;

  return {
    rxBps,
    txBps,
    rxUtilizationPct: computeUtilizationPct(rxBps, capacityMbps),
    txUtilizationPct: computeUtilizationPct(txBps, capacityMbps),
    operStatus: parseOperStatus(operRaw),
    capacityMbps,
    errors,
    drops,
    lastUpdateMs,
  };
}

function resolveLinkStatus(
  from: LinkEndpointRuntimeMetrics,
  to: LinkEndpointRuntimeMetrics,
  thresholds: UtilizationThresholds
): LinkRuntimeMetrics['status'] {
  const operStatuses = [from.operStatus, to.operStatus].filter((s) => s && s !== 'unknown');
  if (operStatuses.some((s) => s === 'down' || s === 'adminDown')) {
    return 'down';
  }
  const utils = [from.rxUtilizationPct, from.txUtilizationPct, to.rxUtilizationPct, to.txUtilizationPct].filter(
    (u): u is number => u !== undefined
  );
  if (utils.some((u) => u >= thresholds.critical)) {
    return 'highUtilization';
  }
  const hasTraffic = [from.rxBps, from.txBps, to.rxBps, to.txBps].some((v) => v !== undefined);
  if (!hasTraffic && operStatuses.length === 0) {
    return 'noData';
  }
  if (utils.some((u) => u >= thresholds.high)) {
    return 'degraded';
  }
  if (operStatuses.every((s) => s === 'up') || hasTraffic) {
    return 'up';
  }
  return 'noData';
}

/** Monta mapa de métricas runtime a partir dos lastvalues Zabbix. */
export function buildLinkRuntimeMetricsMap(
  map: TopologyMap,
  items: Record<string, ZabbixItemLastValue>,
  thresholds: UtilizationThresholds = DEFAULT_UTILIZATION_THRESHOLDS
): LinkRuntimeMetricsMap {
  const result: LinkRuntimeMetricsMap = {};
  for (const link of map.links) {
    if (!link.fromInterface?.metrics && !link.toInterface?.metrics) {
      continue;
    }
    const from = buildEndpointMetrics(link.fromInterface, items, link.bandwidthMbps);
    const to = buildEndpointMetrics(link.toInterface, items, link.bandwidthMbps);
    result[linkKey(link)] = {
      from,
      to,
      status: resolveLinkStatus(from, to, thresholds),
    };
  }
  return result;
}

export function utilizationThresholdsFromOptions(options: TopologyPanelOptions): UtilizationThresholds {
  return {
    attention: options.linkUtilThresholdAttention ?? DEFAULT_UTILIZATION_THRESHOLDS.attention,
    high: options.linkUtilThresholdHigh ?? DEFAULT_UTILIZATION_THRESHOLDS.high,
    critical: options.linkUtilThresholdCritical ?? DEFAULT_UTILIZATION_THRESHOLDS.critical,
  };
}
