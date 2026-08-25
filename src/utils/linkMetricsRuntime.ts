import {
  LinkEndpointRuntimeMetrics,
  LinkRuntimeMetrics,
  LinkRuntimeMetricsMap,
  TopologyInterfaceReference,
  TopologyLink,
  TopologyMap,
  TopologyMetricReference,
  TopologyPanelOptions,
} from '../types';
import { linkKey } from './mapLinkEdits';
import {
  computeUtilizationPct,
  parseOperStatus,
  parseTrafficLastValue,
  speedBpsToMbps,
  UtilizationLevel,
  UtilizationThresholds,
  DEFAULT_UTILIZATION_THRESHOLDS,
} from './zabbixAdapter/formatTraffic';
import { isNumericZabbixItemId, ZabbixItemLastValue } from './zabbixApi';

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

function collectKeysFromReference(ref?: TopologyInterfaceReference): string[] {
  if (!ref?.metrics) {
    return [];
  }
  const keys: string[] = [];
  for (const metric of Object.values(ref.metrics)) {
    const key = metric?.key?.trim();
    if (!key) {
      continue;
    }
    // Já tem id numérico: entra no target Item ID direto, sem resolver a key.
    if (isNumericZabbixItemId(metric?.itemId)) {
      continue;
    }
    keys.push(key);
  }
  return keys;
}

/**
 * Chaves dos cabos sem itemid numérico — o poll resolve via `item.get` e só então lê o lastvalue.
 */
export function collectLinkMetricKeys(links: TopologyLink[]): string[] {
  const keys = new Set<string>();
  for (const link of links) {
    for (const key of collectKeysFromReference(link.fromInterface)) {
      keys.add(key);
    }
    for (const key of collectKeysFromReference(link.toInterface)) {
      keys.add(key);
    }
  }
  return [...keys];
}

/** Copia o lastvalue do itemid resolvido para a key do cabo, que é o que a leitura usa. */
export function aliasLastValuesByItemKey(
  lastValues: Record<string, ZabbixItemLastValue>,
  itemIdByKey: Map<string, string>
): Record<string, ZabbixItemLastValue> {
  if (!itemIdByKey.size) {
    return lastValues;
  }
  const next = { ...lastValues };
  for (const [key, itemId] of itemIdByKey) {
    const row = next[itemId];
    if (row && !next[key]) {
      next[key] = row;
    }
  }
  return next;
}

/** Vinculada por itemid ou por key: sem id numérico o último valor ainda é lido pela key. */
function metricIsBound(ref?: TopologyMetricReference): boolean {
  return Boolean(ref?.itemId || ref?.key);
}

function interfaceHasTrafficItems(ref?: TopologyInterfaceReference): boolean {
  return metricIsBound(ref?.metrics?.rx) || metricIsBound(ref?.metrics?.tx);
}

/**
 * RX/TX na orientação do mapa: ↑ origem→destino (TX), ↓ destino→origem (RX).
 * Com só o destino monitorado (nuvem / link externo), inverte a leitura do switch.
 */
export function resolveLinkMapTrafficMetrics(
  link: TopologyLink,
  metrics?: LinkRuntimeMetrics
): LinkEndpointRuntimeMetrics {
  if (!metrics) {
    return {};
  }
  if (interfaceHasTrafficItems(link.fromInterface)) {
    return metrics.from;
  }
  if (interfaceHasTrafficItems(link.toInterface)) {
    const to = metrics.to;
    return {
      ...to,
      txBps: to.rxBps,
      rxBps: to.txBps,
      txUtilizationPct: to.rxUtilizationPct,
      rxUtilizationPct: to.txUtilizationPct,
    };
  }
  return {};
}

function readItemValue(
  items: Record<string, ZabbixItemLastValue>,
  ref?: TopologyMetricReference
): number | undefined {
  if (!ref) {
    return undefined;
  }
  const raw =
    (ref.itemId ? items[ref.itemId]?.lastvalue : undefined) ??
    (ref.key ? items[ref.key]?.lastvalue : undefined);
  return parseTrafficLastValue(raw);
}

function readItemClock(
  items: Record<string, ZabbixItemLastValue>,
  ref?: TopologyMetricReference
): number | undefined {
  if (!ref) {
    return undefined;
  }
  const clock = Number(
    (ref.itemId ? items[ref.itemId]?.lastclock : undefined) ??
      (ref.key ? items[ref.key]?.lastclock : undefined)
  );
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
  const rxBps = readItemValue(items, m.rx);
  const txBps = readItemValue(items, m.tx);
  const operRaw = readItemValue(items, m.operStatus);
  const speedBps = readItemValue(items, m.speed);
  const capacityMbps = speedBpsToMbps(speedBps) ?? fallbackCapacityMbps;
  const errors = readItemValue(items, m.errors);
  const drops = readItemValue(items, m.drops);
  const clocks = [
    readItemClock(items, m.rx),
    readItemClock(items, m.tx),
    readItemClock(items, m.operStatus),
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

/** Cor do cabo conforme o nível de degradação configurado na aba Links. */
export function linkDegradationColor(
  options: Pick<
    TopologyPanelOptions,
    'colorLink' | 'colorLinkAttention' | 'colorLinkHigh' | 'colorLinkCongestion'
  >,
  level: UtilizationLevel
): string {
  switch (level) {
    case 'attention':
      return options.colorLinkAttention;
    case 'high':
      return options.colorLinkHigh;
    case 'critical':
      return options.colorLinkCongestion;
    default:
      return options.colorLink;
  }
}
