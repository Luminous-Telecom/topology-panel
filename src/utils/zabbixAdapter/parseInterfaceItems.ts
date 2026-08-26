import {
  MetricBindingConfidence,
  TopologyInterfaceMetrics,
  TopologyMetricReference,
  TopologyNetworkInterface,
} from '../../types';
import { InterfaceMetricKind, InterfaceKeyParseOptions, parseInterfaceItemKey, snmpIndexFromToken } from './interfaceItemKeys';
import { interfacesShareIdentity } from './bindInterfaceMetrics';

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
  rxPowerDbm?: number;
  txPowerDbm?: number;
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

function interfaceGroupKey(
  hostKey: string,
  name: string,
  snmpIndex?: string,
  interfaceToken?: string
): string {
  if (snmpIndex) {
    return `${hostKey}\u0000idx:${snmpIndex}`;
  }
  const token = interfaceToken?.trim().toLowerCase();
  if (token) {
    return `${hostKey}\u0000token:${token}`;
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
  /*
   * Só itemid numérico é persistido. Quando o frame não traz o id, o inventário monta um sintético
   * (`hostid:key`) que serve de identidade na leitura, mas guardá-lo faria o mapa mandá-lo como id
   * real em `itemids` no `ds.query()` — o datasource recusa o request inteiro e o mapa perde o
   * status. Sem o id, a leitura do último valor usa a `key`.
   */
  const ref: TopologyMetricReference = {
    key: item.key_,
    confidence: 'high',
  };
  if (isNumericOnlyLabel(item.itemid)) {
    ref.itemId = item.itemid;
  }
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
    case 'rxPower':
      acc.metrics.rxPower = ref;
      acc.rxPowerDbm = parseNumber(item.lastvalue);
      break;
    case 'txPower':
      acc.metrics.txPower = ref;
      acc.txPowerDbm = parseNumber(item.lastvalue);
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

function hasTrafficMetrics(acc: InterfaceAccumulator): boolean {
  return Boolean(acc.metrics.rx || acc.metrics.tx);
}

function hasSignalMetrics(acc: InterfaceAccumulator): boolean {
  return Boolean(acc.metrics.rxPower || acc.metrics.txPower);
}

function foldSignalInto(target: InterfaceAccumulator, source: InterfaceAccumulator): void {
  if (!target.metrics.rxPower && source.metrics.rxPower) {
    target.metrics.rxPower = source.metrics.rxPower;
    target.rxPowerDbm = source.rxPowerDbm;
    target.metricCounts.rxPower = source.metricCounts.rxPower;
  }
  if (!target.metrics.txPower && source.metrics.txPower) {
    target.metrics.txPower = source.metrics.txPower;
    target.txPowerDbm = source.txPowerDbm;
    target.metricCounts.txPower = source.metricCounts.txPower;
  }
}

/** Óptica/rádio costuma vir com outro SNMP index — junta pelo nome/porta na interface de tráfego. */
function mergeSignalIntoTrafficGroups(groups: Map<string, InterfaceAccumulator>): InterfaceAccumulator[] {
  const list = [...groups.values()];
  const absorbed = new Set<InterfaceAccumulator>();
  for (const traffic of list) {
    if (!hasTrafficMetrics(traffic)) {
      continue;
    }
    for (const other of list) {
      if (other === traffic || absorbed.has(other) || hasTrafficMetrics(other) || !hasSignalMetrics(other)) {
        continue;
      }
      if (!interfacesShareIdentity(traffic, other)) {
        continue;
      }
      foldSignalInto(traffic, other);
      absorbed.add(other);
    }
  }
  for (const left of list) {
    if (absorbed.has(left) || hasTrafficMetrics(left) || !hasSignalMetrics(left)) {
      continue;
    }
    for (const right of list) {
      if (right === left || absorbed.has(right) || hasTrafficMetrics(right) || !hasSignalMetrics(right)) {
        continue;
      }
      if (!interfacesShareIdentity(left, right)) {
        continue;
      }
      foldSignalInto(left, right);
      absorbed.add(right);
    }
  }
  return list.filter((acc) => !absorbed.has(acc));
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
    rxPowerDbm: acc.rxPowerDbm,
    txPowerDbm: acc.txPowerDbm,
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
    const groupKey = interfaceGroupKey(hostKey, ifName, snmpIndex, parsed.interfaceToken);

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

  return mergeSignalIntoTrafficGroups(groups)
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
