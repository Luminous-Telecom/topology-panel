import { NeighborFieldKind, NeighborProtocol, parseNeighborItemKey } from './neighborItemKeys';

export interface RawZabbixNeighborItem {
  itemid: string;
  key_: string;
  name?: string;
  lastvalue?: string;
  lastclock?: string;
  hostid?: string;
  tags?: Array<{ tag: string; value: string }>;
}

/** Vizinhança descoberta a partir de itens Zabbix (LLD/SNMP do template). */
export interface ZabbixNeighborRecord {
  hostKey: string;
  hostid?: string;
  protocol: NeighborProtocol;
  /** Porta local (ifName / macro LLD). */
  localInterface?: string;
  localSnmpIndex?: string;
  remoteSysName?: string;
  remotePort?: string;
  remotePortDesc?: string;
  remoteMac?: string;
  lastClock?: number;
}

interface NeighborAccumulator {
  hostKey: string;
  hostid?: string;
  protocol: NeighborProtocol;
  groupKey: string;
  localInterface?: string;
  localSnmpIndex?: string;
  remoteSysName?: string;
  remotePort?: string;
  remotePortDesc?: string;
  remoteMac?: string;
  lastClock?: number;
}

function readTag(tags: RawZabbixNeighborItem['tags'], tagName: string): string | undefined {
  const found = tags?.find((t) => t.tag?.toLowerCase() === tagName.toLowerCase());
  return found?.value?.trim() || undefined;
}

function parseClock(raw?: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) ? n * 1000 : undefined;
}

function groupKeyForItem(
  protocol: NeighborProtocol,
  kind: NeighborFieldKind,
  tokens: string[],
  tags: RawZabbixNeighborItem['tags']
): string {
  const ifTag = readTag(tags, 'interface') || readTag(tags, 'ifname');
  const local = ifTag || tokens[0] || 'unknown';
  const remoteIdx = tokens[1] ?? tokens[0] ?? '0';
  if (kind === 'remoteSysName') {
    return `${protocol}:${local}:${remoteIdx}`;
  }
  return `${protocol}:${local}:${remoteIdx}`;
}

function applyField(acc: NeighborAccumulator, kind: NeighborFieldKind, value?: string, clock?: number): void {
  if (!value) {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  switch (kind) {
    case 'localInterface':
      acc.localInterface = trimmed;
      break;
    case 'remoteSysName':
      acc.remoteSysName = trimmed;
      break;
    case 'remotePort':
    case 'remotePortDesc':
      if (kind === 'remotePortDesc' && !acc.remotePortDesc) {
        acc.remotePortDesc = trimmed;
      }
      if (kind === 'remotePort' || !acc.remotePort) {
        acc.remotePort = trimmed;
      }
      break;
    case 'remoteMac':
    case 'remoteChassis':
      acc.remoteMac = trimmed;
      break;
    default:
      break;
  }
  if (clock) {
    acc.lastClock = Math.max(acc.lastClock ?? 0, clock);
  }
}

function inferLocalInterface(tokens: string[], tags: RawZabbixNeighborItem['tags']): string | undefined {
  const fromTag = readTag(tags, 'interface') || readTag(tags, 'ifname');
  if (fromTag) {
    return fromTag;
  }
  const first = tokens[0];
  if (first && !/^\d+$/.test(first)) {
    return first;
  }
  return undefined;
}

function inferSnmpIndex(tokens: string[]): string | undefined {
  const numeric = tokens.find((t) => /^\d+$/.test(t));
  return numeric;
}

/**
 * Agrupa itens LLDP/CDP do Zabbix por vizinho.
 * Os itens existem apenas se o template do host tiver discovery LLDP/CDP habilitado.
 */
export function parseZabbixNeighborItems(
  hostKey: string,
  hostid: string | undefined,
  items: RawZabbixNeighborItem[]
): ZabbixNeighborRecord[] {
  const groups = new Map<string, NeighborAccumulator>();

  for (const item of items) {
    const key = item.key_?.trim();
    if (!key) {
      continue;
    }
    const parsed = parseNeighborItemKey(key, item.name);
    if (!parsed) {
      continue;
    }

    const gk = groupKeyForItem(parsed.protocol, parsed.kind, parsed.tokens, item.tags);
    let acc = groups.get(gk);
    if (!acc) {
      acc = {
        hostKey,
        hostid,
        protocol: parsed.protocol,
        groupKey: gk,
        localInterface: inferLocalInterface(parsed.tokens, item.tags),
        localSnmpIndex: inferSnmpIndex(parsed.tokens),
      };
      groups.set(gk, acc);
    }

    const value = item.lastvalue?.trim();
    const clock = parseClock(item.lastclock);
    applyField(acc, parsed.kind, value, clock);

    if (!acc.localInterface) {
      acc.localInterface = inferLocalInterface(parsed.tokens, item.tags);
    }
  }

  return [...groups.values()]
    .filter((acc) => acc.remoteSysName || acc.remotePort)
    .map((acc) => ({
      hostKey: acc.hostKey,
      hostid: acc.hostid,
      protocol: acc.protocol,
      localInterface: acc.localInterface,
      localSnmpIndex: acc.localSnmpIndex,
      remoteSysName: acc.remoteSysName,
      remotePort: acc.remotePort ?? acc.remotePortDesc,
      remotePortDesc: acc.remotePortDesc,
      remoteMac: acc.remoteMac,
      lastClock: acc.lastClock,
    }));
}

export function groupNeighborsByHost(
  entries: Array<{ hostKey: string; hostid?: string; items: RawZabbixNeighborItem[] }>
): ZabbixNeighborRecord[] {
  const all: ZabbixNeighborRecord[] = [];
  for (const entry of entries) {
    all.push(...parseZabbixNeighborItems(entry.hostKey, entry.hostid, entry.items));
  }
  return all;
}
