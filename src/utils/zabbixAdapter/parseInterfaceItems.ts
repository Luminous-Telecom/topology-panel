import {
  MetricBindingConfidence,
  TopologyInterfaceMetrics,
  TopologyMetricReference,
  TopologyNetworkInterface,
} from '../../types';
import { InterfaceMetricKind, InterfaceKeyParseOptions, parseInterfaceItemKey, snmpIndexFromToken } from './interfaceItemKeys';

export interface RawZabbixInterfaceItem {
  itemid: string;
  key_: string;
  name?: string;
  lastvalue?: string;
  lastclock?: string;
  hostid?: string;
  tags?: Array<{ tag: string; value: string }>;
}

interface InterfaceAccumulator {
  hostKey: string;
  hostid?: string;
  name: string;
  snmpIndex?: string;
  alias?: string;
  description?: string;
  mac?: string;
  ip?: string;
  speedMbps?: number;
  adminStatus?: number;
  operStatus?: number;
  metrics: TopologyInterfaceMetrics;
  metricCounts: Partial<Record<InterfaceMetricKind, number>>;
}

function readTag(tags: RawZabbixInterfaceItem['tags'], tagName: string): string | undefined {
  const found = tags?.find((t) => t.tag?.toLowerCase() === tagName.toLowerCase());
  return found?.value?.trim() || undefined;
}

function isNumericOnlyLabel(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function preferInterfaceName(current: string, candidate: string): string {
  const next = candidate.trim();
  if (!next) {
    return current;
  }
  if (isNumericOnlyLabel(current) && !isNumericOnlyLabel(next)) {
    return next;
  }
  if (isNumericOnlyLabel(next)) {
    return current;
  }
  if (next.length > current.length) {
    return next;
  }
  return current;
}

/** Nome do item no Zabbix, sem recorte. Token da key só se o item não tiver name. */
function interfaceDisplayName(itemName: string | undefined, token: string): string {
  const fromZabbix = itemName?.trim();
  if (fromZabbix) {
    return fromZabbix;
  }
  const t = token.trim();
  if (t && !isNumericOnlyLabel(t) && !/^ifHC/i.test(t)) {
    return t;
  }
  return t || 'interface';
}

function parseNumber(value?: string): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function interfaceGroupKey(hostKey: string, name: string, snmpIndex?: string): string {
  if (snmpIndex) {
    return `${hostKey}\u0000idx:${snmpIndex}`;
  }
  return `${hostKey}\u0000name:${name.toLowerCase()}`;
}

function metricConfidence(kind: InterfaceMetricKind, count: number): MetricBindingConfidence {
  if (count > 1 && (kind === 'rx' || kind === 'tx')) {
    return 'ambiguous';
  }
  if (count === 1) {
    return 'high';
  }
  return 'medium';
}

function addMetric(
  acc: InterfaceAccumulator,
  kind: InterfaceMetricKind,
  item: RawZabbixInterfaceItem
): void {
  const ref: TopologyMetricReference = {
    itemId: item.itemid,
    key: item.key_,
    confidence: 'high',
  };
  const counts = acc.metricCounts[kind] ?? 0;
  acc.metricCounts[kind] = counts + 1;

  switch (kind) {
    case 'rx':
      acc.metrics.rx = ref;
      break;
    case 'tx':
      acc.metrics.tx = ref;
      break;
    case 'operStatus':
      acc.metrics.operStatus = ref;
      acc.operStatus = parseNumber(item.lastvalue);
      break;
    case 'adminStatus':
      acc.metrics.adminStatus = ref;
      acc.adminStatus = parseNumber(item.lastvalue);
      break;
    case 'speed': {
      acc.metrics.speed = ref;
      const bps = parseNumber(item.lastvalue);
      if (bps !== undefined && bps > 0) {
        acc.speedMbps = Math.round(bps / 1_000_000);
      }
      break;
    }
    case 'errors':
      acc.metrics.errors = ref;
      break;
    case 'drops':
      acc.metrics.drops = ref;
      break;
    default:
      break;
  }
}

function finalizeConfidence(acc: InterfaceAccumulator): MetricBindingConfidence {
  const kinds: InterfaceMetricKind[] = ['rx', 'tx', 'operStatus'];
  for (const kind of kinds) {
    const count = acc.metricCounts[kind] ?? 0;
    if (count > 1) {
      return 'ambiguous';
    }
  }
  if (acc.metrics.rx && acc.metrics.tx) {
    return 'high';
  }
  if (acc.metrics.rx || acc.metrics.tx) {
    return 'medium';
  }
  return 'low';
}

function finalizeInterface(acc: InterfaceAccumulator): TopologyNetworkInterface {
  const rxCount = acc.metricCounts.rx ?? 0;
  const txCount = acc.metricCounts.tx ?? 0;
  if (acc.metrics.rx) {
    acc.metrics.rx.confidence = metricConfidence('rx', rxCount);
  }
  if (acc.metrics.tx) {
    acc.metrics.tx.confidence = metricConfidence('tx', txCount);
  }
  return {
    hostKey: acc.hostKey,
    hostid: acc.hostid,
    name: acc.name,
    alias: acc.alias,
    description: acc.description,
    snmpIndex: acc.snmpIndex,
    mac: acc.mac,
    ip: acc.ip,
    speedMbps: acc.speedMbps,
    adminStatus: acc.adminStatus,
    operStatus: acc.operStatus,
    metrics: acc.metrics,
    bindingConfidence: finalizeConfidence(acc),
  };
}

/**
 * Agrupa itens Zabbix de interface por host e nome/index.
 * Genérico — deriva tudo da key, tags e nome do item; sem lista fixa de hosts ou templates.
 */
export function parseZabbixInterfaceItems(
  hostKey: string,
  hostid: string | undefined,
  items: RawZabbixInterfaceItem[],
  keyParseOptions?: InterfaceKeyParseOptions
): TopologyNetworkInterface[] {
  const groups = new Map<string, InterfaceAccumulator>();

  for (const item of items) {
    const key = item.key_?.trim();
    if (!key) {
      continue;
    }
    const parsed = parseInterfaceItemKey(key, keyParseOptions);
    if (!parsed) {
      continue;
    }

    const ifName = interfaceDisplayName(item.name, parsed.interfaceToken);
    const snmpIndex = parsed.snmpIndex ?? snmpIndexFromToken(parsed.interfaceToken);
    const groupKey = interfaceGroupKey(hostKey, ifName, snmpIndex);

    let acc = groups.get(groupKey);
    if (!acc) {
      acc = {
        hostKey,
        hostid,
        name: ifName,
        snmpIndex,
        alias: readTag(item.tags, 'ifalias'),
        description: readTag(item.tags, 'ifdescr'),
        mac: readTag(item.tags, 'mac'),
        ip: readTag(item.tags, 'ip'),
        metrics: {},
        metricCounts: {},
      };
      groups.set(groupKey, acc);
    } else {
      acc.name = preferInterfaceName(acc.name, ifName);
    }

    addMetric(acc, parsed.kind, item);
  }

  return [...groups.values()]
    .map(finalizeInterface)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Primeira lista não vazia entre as chaves (IP, nome visível, host técnico). */
export function pickHostInterfaces(
  byHost: Record<string, TopologyNetworkInterface[]>,
  candidates: string[]
): TopologyNetworkInterface[] {
  for (const key of candidates) {
    const found = byHost[key];
    if (found?.length) {
      return found;
    }
  }
  return [];
}

/** Mapa hostKey → interfaces descobertas. */
export function groupInterfacesByHost(
  entries: Array<{ hostKey: string; hostid?: string; items: RawZabbixInterfaceItem[] }>,
  keyParseOptions?: InterfaceKeyParseOptions
): Record<string, TopologyNetworkInterface[]> {
  const result: Record<string, TopologyNetworkInterface[]> = {};
  for (const entry of entries) {
    result[entry.hostKey] = parseZabbixInterfaceItems(
      entry.hostKey,
      entry.hostid,
      entry.items,
      keyParseOptions
    );
  }
  return result;
}
