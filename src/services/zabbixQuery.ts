import { isIpv4 } from '../utils/ipv4';
import { ZABBIX_PROBLEM_MIN_SEVERITY, type HostProblemsMap } from '../utils/noc/types';
import { itemMatchesInterfaceKeywords } from '../utils/zabbixAdapter/interfaceItemKeys';
import { isNumericZabbixItemId, zabbixHostItemKey } from '../utils/zabbixApi';
import type {
  ZabbixDirectHost,
  ZabbixDirectMetadata,
  ZabbixHostInterfaceItems,
  ZabbixInterfaceHostRef,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
  ZabbixResolvedGroups,
} from '../utils/zabbixApi';
import { zabbixCall, type ZabbixParams, type ZabbixRpc } from './zabbixCall';

const HOST_MONITORED = '0';
const PROBLEMS_LIMIT = 1001;
const TRAFFIC_OUTPUT = ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'];
/** `item.get` por itemids em fatias — um POST enorme estoura o proxy e o cabo parece travado. */
export const ZABBIX_ITEM_GET_BATCH = 500;

type HostGroupRow = { groupid?: string; name?: string };
type HostTagRow = { tag?: string; value?: string };
type HostIfaceRow = { ip?: string; main?: string; type?: string };
type HostRow = {
  hostid?: string;
  host?: string;
  name?: string;
  description?: string;
  interfaces?: HostIfaceRow[];
  hostgroups?: Array<{ name?: string }>;
  groups?: Array<{ name?: string }>;
  tags?: HostTagRow[];
};
type ItemRow = {
  itemid?: string | number;
  key_?: string;
  name?: string;
  hostid?: string | number;
  lastvalue?: string | number;
  lastclock?: string | number;
  value_type?: string | number;
};

function asItemString(value: string | number | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
}
type ProblemRow = {
  name?: string;
  description?: string;
  severity?: unknown;
  eventid?: string | number;
  objectid?: string | number;
  hostid?: string | number;
  suppressed?: unknown;
  hosts?: Array<{ hostid?: string | number }>;
};
type TriggerRow = {
  triggerid?: string | number;
  status?: unknown;
  hosts?: Array<{ hostid?: string | number }>;
};
type EventRow = {
  eventid?: string | number;
  hosts?: Array<{ hostid?: string | number }>;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickMainIp(ifaces: HostIfaceRow[] | undefined): string | undefined {
  if (!ifaces?.length) {
    return undefined;
  }
  for (const iface of ifaces) {
    if (iface.main === '1' || iface.main === 'true') {
      const ip = iface.ip?.trim();
      if (ip) {
        return ip;
      }
    }
  }
  for (const iface of ifaces) {
    const ip = iface.ip?.trim();
    if (ip) {
      return ip;
    }
  }
  return undefined;
}

function rowsToInterfaceItems(rows: ItemRow[]): ZabbixInterfaceItem[] {
  const items: ZabbixInterfaceItem[] = [];
  for (const row of rows) {
    const key = row.key_?.trim();
    if (!key) {
      continue;
    }
    const hostid = asItemString(row.hostid) ?? '';
    const itemid = asItemString(row.itemid) || zabbixHostItemKey(hostid, key);
    items.push({
      itemid,
      key_: key,
      name: row.name?.trim() || undefined,
      hostid: hostid || undefined,
      lastvalue: asItemString(row.lastvalue),
      lastclock: asItemString(row.lastclock),
    });
  }
  return items;
}

function indexLastValues(rows: ItemRow[]): {
  lastValues: Record<string, ZabbixItemLastValue>;
  itemIdByKey: Record<string, string>;
} {
  const lastValues: Record<string, ZabbixItemLastValue> = {};
  const itemIdByKey: Record<string, string> = {};
  for (const row of rows) {
    const itemid = asItemString(row.itemid);
    if (!isNumericZabbixItemId(itemid)) {
      continue;
    }
    const stored: ZabbixItemLastValue = {
      itemid,
      lastvalue: asItemString(row.lastvalue),
      lastclock: asItemString(row.lastclock),
    };
    lastValues[itemid] = stored;
    const key = row.key_?.trim();
    const hostid = asItemString(row.hostid);
    if (key && isNumericZabbixItemId(hostid)) {
      const scoped = zabbixHostItemKey(hostid, key);
      lastValues[scoped] = stored;
      if (!itemIdByKey[scoped]) {
        itemIdByKey[scoped] = itemid;
      }
    }
  }
  return { lastValues, itemIdByKey };
}

export function statusItemSearch(statusItemKey: string): { keyFilter: string; nameFilter: string } {
  let trimmed = statusItemKey.trim();
  const wrapped = /^\/(.+)\/[a-z]*$/.exec(trimmed);
  if (wrapped?.[1]) {
    trimmed = wrapped[1].trim();
  }
  if (!trimmed) {
    return { keyFilter: '', nameFilter: '' };
  }
  if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(trimmed)) {
    return { keyFilter: trimmed, nameFilter: '' };
  }
  return { keyFilter: '', nameFilter: trimmed };
}

export async function fetchHostGroupNames(datasourceUid: string, call: ZabbixRpc = zabbixCall): Promise<string[]> {
  const rows = await call<HostGroupRow[]>(datasourceUid, 'hostgroup.get', {
    output: ['groupid', 'name'],
  });
  return uniqueSorted(rows.map((row) => row.name ?? ''));
}

export async function fetchResolvedGroups(
  datasourceUid: string,
  groupNames: string[],
  cached: ZabbixResolvedGroups | undefined,
  call: ZabbixRpc = zabbixCall
): Promise<ZabbixResolvedGroups> {
  const wanted = uniqueSorted(groupNames);
  if (!wanted.length) {
    return { resolvedGroups: [], groupIds: [] };
  }
  if (cached?.groupIds.length) {
    return cached;
  }
  const wantedKeys = new Map(wanted.map((name) => [name.toUpperCase(), name]));
  const matchRows = (rows: HostGroupRow[]): ZabbixResolvedGroups => {
    const resolvedGroups: string[] = [];
    const groupIds: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const name = row.name?.trim() ?? '';
      const groupid = row.groupid?.trim() ?? '';
      const canonical = wantedKeys.get(name.toUpperCase());
      if (!canonical || !isNumericZabbixItemId(groupid) || seen.has(canonical.toUpperCase())) {
        continue;
      }
      seen.add(canonical.toUpperCase());
      resolvedGroups.push(canonical);
      groupIds.push(groupid);
    }
    return { resolvedGroups, groupIds };
  };
  const filtered = matchRows(
    await call<HostGroupRow[]>(datasourceUid, 'hostgroup.get', {
      output: ['groupid', 'name'],
      filter: { name: wanted },
    })
  );
  if (filtered.groupIds.length === wanted.length) {
    return filtered;
  }
  return matchRows(
    await call<HostGroupRow[]>(datasourceUid, 'hostgroup.get', {
      output: ['groupid', 'name'],
    })
  );
}

export async function fetchDirectMetadata(
  datasourceUid: string,
  groupNames: string[],
  cached: ZabbixResolvedGroups | undefined,
  call: ZabbixRpc = zabbixCall
): Promise<ZabbixDirectMetadata> {
  const groups = await fetchResolvedGroups(datasourceUid, groupNames, cached, call);
  if (!groups.resolvedGroups.length) {
    return { hosts: [], resolvedGroups: groups.resolvedGroups, groupIds: groups.groupIds };
  }
  const wantedByUpper = new Map(
    groups.resolvedGroups.map((name) => [name.trim().toUpperCase(), name] as const)
  );
  const rows = await call<HostRow[]>(datasourceUid, 'host.get', {
    groupids: groups.groupIds,
    output: ['hostid', 'host', 'name', 'description'],
    selectInterfaces: ['ip', 'main', 'type'],
    selectHostGroups: ['name'],
    selectTags: ['tag', 'value'],
    filter: { status: HOST_MONITORED },
    monitored_hosts: true,
  });
  const hosts: ZabbixDirectHost[] = [];
  for (const row of rows) {
    const hostid = row.hostid?.trim() ?? '';
    const technical = row.host?.trim() ?? '';
    const visible = row.name?.trim() || technical;
    if (!isNumericZabbixItemId(hostid) || !visible) {
      continue;
    }
    const rawGroups = [...(row.hostgroups ?? []), ...(row.groups ?? [])];
    const hostGroups: string[] = [];
    const seenGroup = new Set<string>();
    for (const group of rawGroups) {
      const name = group.name?.trim();
      if (!name) {
        continue;
      }
      const canonical = wantedByUpper.get(name.toUpperCase());
      if (!canonical) {
        continue;
      }
      const key = canonical.toUpperCase();
      if (seenGroup.has(key)) {
        continue;
      }
      seenGroup.add(key);
      hostGroups.push(canonical);
    }
    const tags = (row.tags ?? [])
      .map((tag) => ({ tag: tag.tag?.trim() ?? '', value: tag.value?.trim() ?? '' }))
      .filter((tag) => tag.tag);
    hosts.push({
      hostid,
      host: technical,
      name: visible,
      ip: pickMainIp(row.interfaces),
      description: row.description?.trim() || undefined,
      groups: hostGroups,
      tags: tags.length ? tags : undefined,
    });
  }
  return { hosts, resolvedGroups: groups.resolvedGroups, groupIds: groups.groupIds };
}

export async function fetchStatusLastValues(
  datasourceUid: string,
  statusItemKey: string,
  hostids: string[],
  extraKeys: string[],
  call: ZabbixRpc = zabbixCall,
  groupids: string[] = []
): Promise<ZabbixInterfaceItem[]> {
  const { keyFilter, nameFilter } = statusItemSearch(statusItemKey);
  const extra = uniqueSorted(extraKeys);
  const filter: Record<string, string | string[]> = {};
  if (keyFilter) {
    const keys = uniqueSorted([keyFilter, ...extra]);
    filter.key_ = keys.length === 1 ? keys[0] : keys;
  } else if (nameFilter) {
    filter.name = nameFilter;
  }
  const scopedHosts = hostids.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id));
  const scopedGroups = groupids.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id));
  if (!Object.keys(filter).length || (!scopedHosts.length && !scopedGroups.length)) {
    return [];
  }
  const params: ZabbixParams = {
    output: TRAFFIC_OUTPUT,
    filter,
  };
  if (scopedHosts.length) {
    params.hostids = scopedHosts;
  } else {
    params.groupids = scopedGroups;
  }
  const rows = await call<ItemRow[]>(datasourceUid, 'item.get', params);
  return rowsToInterfaceItems(rows);
}

export async function fetchTrafficLastValues(
  datasourceUid: string,
  itemIds: string[],
  itemKeys: string[],
  hostids: string[],
  call: ZabbixRpc = zabbixCall,
  groupids: string[] = []
): Promise<{
  lastValues: Record<string, ZabbixItemLastValue>;
  itemIdByKey: Record<string, string>;
  interfaceItems: ZabbixInterfaceItem[];
}> {
  const ids = uniqueSorted(itemIds).filter((id) => isNumericZabbixItemId(id));
  const keys = uniqueSorted(itemKeys);
  if (!ids.length && !keys.length) {
    return { lastValues: {}, itemIdByKey: {}, interfaceItems: [] };
  }
  let rows: ItemRow[];
  if (ids.length) {
    rows = [];
    for (let offset = 0; offset < ids.length; offset += ZABBIX_ITEM_GET_BATCH) {
      const batch = ids.slice(offset, offset + ZABBIX_ITEM_GET_BATCH);
      const part = await call<ItemRow[]>(datasourceUid, 'item.get', {
        itemids: batch,
        output: TRAFFIC_OUTPUT,
      });
      rows.push(...part);
    }
  } else {
    const scopedHosts = hostids.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id));
    const scopedGroups = groupids.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id));
    const params: ZabbixParams = {
      output: TRAFFIC_OUTPUT,
      filter: { key_: keys },
    };
    if (scopedHosts.length) {
      params.hostids = scopedHosts;
    } else if (scopedGroups.length) {
      params.groupids = scopedGroups;
    }
    rows = await call<ItemRow[]>(datasourceUid, 'item.get', params);
  }
  const indexed = indexLastValues(rows);
  return { ...indexed, interfaceItems: rowsToInterfaceItems(rows) };
}

function problemIsSuppressed(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true';
  }
  return false;
}

function triggerIsDisabled(value: unknown): boolean {
  if (typeof value === 'number') {
    return value === 1;
  }
  return value === '1';
}

function problemHostIds(row: ProblemRow): string[] {
  const ids: string[] = [];
  const add = (raw?: string | number) => {
    const id = asItemString(raw) ?? '';
    if (isNumericZabbixItemId(id) && !ids.includes(id)) {
      ids.push(id);
    }
  };
  add(row.hostid);
  for (const host of row.hosts ?? []) {
    add(host.hostid);
  }
  return ids;
}

function numericIds(values: Array<string | number | undefined>): string[] {
  return uniqueSorted(values.map((value) => asItemString(value) ?? '')).filter((id) =>
    isNumericZabbixItemId(id)
  );
}

function mergeProblemHosts(row: ProblemRow, hostids: string[] | undefined): ProblemRow {
  if (!hostids?.length || problemHostIds(row).length) {
    return row;
  }
  return { ...row, hosts: hostids.map((hostid) => ({ hostid })) };
}

async function attachHostsFromEvents(
  datasourceUid: string,
  rows: ProblemRow[],
  call: ZabbixRpc
): Promise<ProblemRow[]> {
  const eventids = numericIds(rows.map((row) => row.eventid));
  if (!eventids.length) {
    return rows;
  }
  const events = await call<EventRow[]>(datasourceUid, 'event.get', {
    eventids,
    output: ['eventid'],
    selectHosts: ['hostid'],
    source: 0,
    object: 0,
  });
  const list = Array.isArray(events) ? events : [];
  const hostsByEvent = new Map<string, string[]>();
  for (const event of list) {
    const eventid = asItemString(event.eventid) ?? '';
    const hostids = numericIds((event.hosts ?? []).map((host) => host.hostid));
    if (eventid && hostids.length) {
      hostsByEvent.set(eventid, hostids);
    }
  }
  return rows.map((row) => mergeProblemHosts(row, hostsByEvent.get(asItemString(row.eventid) ?? '')));
}

async function attachHostsFromTriggers(
  datasourceUid: string,
  rows: ProblemRow[],
  call: ZabbixRpc
): Promise<ProblemRow[]> {
  const missing = rows.filter((row) => problemHostIds(row).length === 0);
  const triggerIds = numericIds(missing.map((row) => row.objectid));
  if (!triggerIds.length) {
    return rows;
  }
  const triggers = await call<TriggerRow[]>(datasourceUid, 'trigger.get', {
    triggerids: triggerIds,
    output: ['triggerid', 'status'],
    filter: { status: 0 },
    selectHosts: ['hostid'],
  });
  const list = Array.isArray(triggers) ? triggers : [];
  const hostsByTrigger = new Map<string, string[]>();
  for (const trigger of list) {
    if (triggerIsDisabled(trigger.status)) {
      continue;
    }
    const triggerid = asItemString(trigger.triggerid) ?? '';
    const hostids = numericIds((trigger.hosts ?? []).map((host) => host.hostid));
    if (triggerid && hostids.length) {
      hostsByTrigger.set(triggerid, hostids);
    }
  }
  return rows.map((row) => mergeProblemHosts(row, hostsByTrigger.get(asItemString(row.objectid) ?? '')));
}

async function attachProblemHosts(
  datasourceUid: string,
  rows: ProblemRow[],
  call: ZabbixRpc
): Promise<ProblemRow[]> {
  // `problem.get` não tem selectHosts. O host do evento sai de `event.get`; `trigger.get` é
  // reserva quando o eventid não veio, o evento não trouxe host, ou o `event.get` falhou.
  try {
    const fromEvents = await attachHostsFromEvents(datasourceUid, rows, call);
    if (fromEvents.every((row) => problemHostIds(row).length > 0)) {
      return fromEvents;
    }
    return attachHostsFromTriggers(datasourceUid, fromEvents, call);
  } catch {
    return attachHostsFromTriggers(datasourceUid, rows, call);
  }
}

/** Descarta problema cujo trigger está desativado — o event.get ainda traz o host. */
async function keepProblemsFromEnabledTriggers(
  datasourceUid: string,
  rows: ProblemRow[],
  call: ZabbixRpc
): Promise<ProblemRow[]> {
  const triggerIds = numericIds(rows.map((row) => row.objectid));
  if (!triggerIds.length) {
    return rows;
  }
  try {
    const triggers = await call<TriggerRow[]>(datasourceUid, 'trigger.get', {
      triggerids: triggerIds,
      output: ['triggerid', 'status'],
      filter: { status: 0 },
    });
    const enabled = new Set<string>();
    for (const trigger of Array.isArray(triggers) ? triggers : []) {
      if (triggerIsDisabled(trigger.status)) {
        continue;
      }
      const id = asItemString(trigger.triggerid) ?? '';
      if (isNumericZabbixItemId(id)) {
        enabled.add(id);
      }
    }
    return rows.filter((row) => enabled.has(asItemString(row.objectid) ?? ''));
  } catch {
    return rows;
  }
}

export function parseProblems(rows: ProblemRow[], hostids: string[]): HostProblemsMap {
  const wanted = new Set(hostids.map((id) => id.trim()).filter(Boolean));
  const summary: HostProblemsMap = {};
  const namesByHost = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (problemIsSuppressed(row.suppressed)) {
      continue;
    }
    const severity = asNumber(row.severity);
    if (severity < ZABBIX_PROBLEM_MIN_SEVERITY) {
      continue;
    }
    const name = row.name?.trim() || row.description?.trim() || '';
    for (const hostid of problemHostIds(row)) {
      if (wanted.size && !wanted.has(hostid)) {
        continue;
      }
      const prev = summary[hostid];
      summary[hostid] = {
        count: (prev?.count ?? 0) + 1,
        maxSeverity: Math.max(prev?.maxSeverity ?? 0, severity),
      };
      if (!name) {
        continue;
      }
      const byName = namesByHost.get(hostid) ?? new Map<string, number>();
      const current = byName.get(name) ?? 0;
      if (severity >= current) {
        byName.set(name, severity);
      }
      namesByHost.set(hostid, byName);
    }
  }
  for (const [hostid, current] of Object.entries(summary)) {
    const entries = [...(namesByHost.get(hostid)?.entries() ?? [])].sort((a, b) => {
      if (a[1] !== b[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0], 'pt-BR');
    });
    if (entries.length) {
      current.names = entries.map(([name]) => name);
    }
  }
  return summary;
}

export async function fetchProblems(
  datasourceUid: string,
  hostids: string[],
  call: ZabbixRpc = zabbixCall,
  groupids: string[] = []
): Promise<HostProblemsMap> {
  const ids = uniqueSorted(hostids).filter((id) => isNumericZabbixItemId(id));
  const gids = uniqueSorted(groupids).filter((id) => isNumericZabbixItemId(id));
  if (!ids.length && !gids.length) {
    return {};
  }
  const severities: number[] = [];
  for (let sev = ZABBIX_PROBLEM_MIN_SEVERITY; sev <= 5; sev += 1) {
    severities.push(sev);
  }
  // `problem.get` não aceita `selectHosts` — o Zabbix recusa e o proxy responde 500.
  // `trigger.get` (status 0) descarta trigger desativado; sem hostid, o host sai de `event.get`.
  const params: ZabbixParams = {
    output: ['eventid', 'objectid', 'name', 'severity'],
    severities,
    source: 0,
    object: 0,
    recent: false,
    suppressed: false,
    limit: PROBLEMS_LIMIT,
  };
  if (ids.length) {
    params.hostids = ids;
  } else {
    params.groupids = gids;
  }
  const rows = await call<ProblemRow[]>(datasourceUid, 'problem.get', params);
  const active = await keepProblemsFromEnabledTriggers(datasourceUid, rows, call);
  const needsHost =
    active.length > 0 && active.some((row) => problemHostIds(row).length === 0);
  const withHosts = needsHost ? await attachProblemHosts(datasourceUid, active, call) : active;
  return parseProblems(withHosts, ids);
}

export async function fetchItemNames(
  datasourceUid: string,
  groupNames: string[],
  call: ZabbixRpc = zabbixCall
): Promise<string[]> {
  const wanted = uniquePreserve(groupNames);
  if (!wanted.length) {
    return [];
  }
  const resolved = await fetchResolvedGroups(datasourceUid, wanted, undefined, call);
  const groupIdByName = new Map<string, string>();
  resolved.resolvedGroups.forEach((name, index) => {
    const id = resolved.groupIds[index];
    if (id) {
      groupIdByName.set(name.toUpperCase(), id);
    }
  });
  for (const groupName of wanted) {
    const groupid = groupIdByName.get(groupName.toUpperCase());
    if (!isNumericZabbixItemId(groupid)) {
      continue;
    }
    const rows = await call<Array<{ name?: string }>>(datasourceUid, 'item.get', {
      groupids: [groupid],
      output: ['name'],
      monitored: true,
    });
    const names = uniqueSorted(rows.map((row) => row.name ?? ''));
    if (names.length) {
      return names;
    }
  }
  return [];
}

export async function fetchHostInterfaceItems(
  datasourceUid: string,
  hosts: ZabbixInterfaceHostRef[],
  searchKeys: string[],
  call: ZabbixRpc = zabbixCall
): Promise<ZabbixHostInterfaceItems[]> {
  const uniqueHosts: ZabbixHostInterfaceItems[] = [];
  const seen = new Set<string>();
  for (const host of hosts) {
    const hostKey = host.hostKey.trim();
    const hostid = host.hostid?.trim() ?? '';
    if (!hostKey || !isNumericZabbixItemId(hostid) || seen.has(hostid)) {
      continue;
    }
    seen.add(hostid);
    uniqueHosts.push({ hostKey, hostid, items: [] });
  }
  const terms = uniqueSorted(searchKeys);
  if (!uniqueHosts.length || !terms.length) {
    return uniqueHosts;
  }
  const hostids = uniqueHosts.map((host) => host.hostid);
  const rows: ItemRow[] = [];
  for (const term of terms) {
    const part = await call<ItemRow[]>(datasourceUid, 'item.get', {
      output: TRAFFIC_OUTPUT,
      hostids,
      search: { key_: term },
    });
    rows.push(...part);
  }
  const byHost = new Map<string, ZabbixInterfaceItem[]>();
  for (const host of uniqueHosts) {
    byHost.set(host.hostid, []);
  }
  for (const item of rowsToInterfaceItems(rows)) {
    const hostid = item.hostid?.trim() ?? '';
    const bucket = byHost.get(hostid);
    if (!bucket || !itemMatchesInterfaceKeywords(item.key_, item.name ?? '', terms)) {
      continue;
    }
    bucket.push(item);
  }
  return uniqueHosts.map((host) => ({
    ...host,
    items: byHost.get(host.hostid) ?? [],
  }));
}

function parseFloatOrNull(raw: string | number | undefined): number | null {
  const trimmed = asItemString(raw);
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export type HostIcmpStatus = {
  reachable: boolean | null;
  lossPct: number | null;
  rttMs: number | null;
  lastClock?: number;
  error?: string;
};

export type BackendPingResult = {
  success: boolean;
  output: string;
  error?: string;
  icmp?: HostIcmpStatus;
};

const pingScriptIds = new Map<string, { panel: string; continuous: string }>();

async function fetchPingScriptIds(
  datasourceUid: string,
  call: ZabbixRpc
): Promise<{ panel: string; continuous: string }> {
  const cached = pingScriptIds.get(datasourceUid);
  if (cached) {
    return cached;
  }
  const rows = await call<Array<{ scriptid?: string; name?: string }>>(datasourceUid, 'script.get', {
    output: ['scriptid', 'name'],
  });
  const byName = (wanted: string): string => {
    const target = wanted.trim().toLowerCase();
    for (const row of rows) {
      if ((row.name ?? '').trim().toLowerCase() === target) {
        return row.scriptid?.trim() ?? '';
      }
    }
    return '';
  };
  const ids = {
    panel: byName('Ping rápido') || byName('Ping'),
    continuous: byName('Ping'),
  };
  pingScriptIds.set(datasourceUid, ids);
  return ids;
}

async function fetchIcmpByHostId(
  datasourceUid: string,
  hostId: string,
  call: ZabbixRpc
): Promise<HostIcmpStatus> {
  const rows = await call<ItemRow[]>(datasourceUid, 'item.get', {
    hostids: [hostId],
    output: ['itemid', 'key_', 'lastvalue', 'lastclock', 'value_type'],
    search: { key_: 'icmpping' },
    searchByAny: true,
  });
  if (!rows.length) {
    return {
      reachable: null,
      lossPct: null,
      rttMs: null,
      error: 'Itens ICMP (icmpping) não encontrados neste host',
    };
  }
  let reachable: boolean | null = null;
  let lossPct: number | null = null;
  let rttMs: number | null = null;
  let lastClock = 0;
  for (const row of rows) {
    const key = (row.key_ ?? '').toLowerCase();
    const clock = parseFloatOrNull(row.lastclock);
    if (clock !== null && clock > lastClock) {
      lastClock = clock;
    }
    if (key.includes('icmppingloss')) {
      lossPct = parseFloatOrNull(row.lastvalue);
      continue;
    }
    if (key.includes('icmppingsec')) {
      const sec = parseFloatOrNull(row.lastvalue);
      rttMs = sec !== null ? sec * 1000 : null;
      continue;
    }
    if (key.startsWith('icmpping')) {
      const n = parseFloatOrNull(row.lastvalue);
      if (n !== null) {
        reachable = n >= 1;
      }
    }
  }
  if (reachable === null) {
    if (rttMs !== null && rttMs > 0) {
      reachable = true;
    } else if (lossPct !== null) {
      reachable = lossPct < 100;
    }
  } else if (rttMs !== null && rttMs > 0) {
    reachable = true;
  } else if (lossPct !== null && lossPct < 100) {
    reachable = true;
  }
  return {
    reachable,
    lossPct,
    rttMs,
    lastClock: lastClock || undefined,
  };
}

export async function runZabbixPing(
  datasourceUid: string,
  hostId: string,
  mode: 'panel' | 'continuous' = 'panel',
  call: ZabbixRpc = zabbixCall
): Promise<BackendPingResult> {
  const uid = datasourceUid.trim();
  const id = hostId.trim();
  if (!uid || !isNumericZabbixItemId(id)) {
    return { success: false, output: '', error: 'Host ou datasource Zabbix não configurado' };
  }
  try {
    const ids = await fetchPingScriptIds(uid, call);
    const scriptId = mode === 'continuous' ? ids.continuous : ids.panel;
    if (!scriptId) {
      return {
        success: false,
        output: '',
        error: 'Script Ping não encontrado no Zabbix (Alerts → Scripts)',
      };
    }
    const raw = await call<{ response?: string; value?: string }>(uid, 'script.execute', {
      scriptid: scriptId,
      hostid: id,
    });
    const output = raw.value?.trim() ?? '';
    const result: BackendPingResult = output
      ? { success: raw.response === 'success', output }
      : {
          success: false,
          output: '',
          error: 'Ping executado, mas sem saída. Verifique permissões de script no Zabbix.',
        };
    try {
      result.icmp = await fetchIcmpByHostId(uid, id, call);
    } catch {
      // ICMP é complementar ao script; falha não esconde a saída do ping.
    }
    return result;
  } catch {
    return { success: false, output: '', error: 'Falha ao executar o ping no Zabbix.' };
  }
}

/** Testes: limpa o cache de scriptid do ping. */
export function dropPingScriptCache(): void {
  pingScriptIds.clear();
}
