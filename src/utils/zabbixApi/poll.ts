import {
  ZABBIX_CALL_TIMEOUT_MS,
  ZABBIX_STATUS_CALL_TIMEOUT_MS,
  ZabbixCallOptions,
  zabbixCall,
} from './client';
import {
  ZABBIX_HOST_MONITORED,
  ZABBIX_HOST_OUTPUT,
  ZabbixHost,
  normalizeZabbixHostDescription,
  pickMainInterfaceIp,
} from './hostShape';
import { asZabbixId, isNumericZabbixItemId, zabbixHostItemKey } from './itemIds';
import {
  ZabbixDirectHost,
  ZabbixDirectMetadata,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
  ZabbixResolvedGroups,
} from './types';

const TRAFFIC_ITEM_OUTPUT = ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'];

interface ZabbixTrafficItemRow {
  itemid?: string;
  key_?: string;
  name?: string;
  hostid?: string;
  lastvalue?: string;
  lastclock?: string;
}

function scopedTrafficHostIds(hostids?: string[]): string[] {
  return [...new Set((hostids ?? []).map((id) => asZabbixId(id)).filter((id) => isNumericZabbixItemId(id)))];
}

function indexTrafficItemRows(rows: ZabbixTrafficItemRow[] | undefined): {
  lastValues: Record<string, ZabbixItemLastValue>;
  itemIdByKey: Map<string, string>;
} {
  const lastValues: Record<string, ZabbixItemLastValue> = {};
  const itemIdByKey = new Map<string, string>();
  for (const row of rows ?? []) {
    const itemid = asZabbixId(row.itemid);
    if (!isNumericZabbixItemId(itemid)) {
      continue;
    }
    const stored: ZabbixItemLastValue = { itemid };
    if (row.lastvalue !== undefined) {
      stored.lastvalue = row.lastvalue;
    }
    const lastclock = String(row.lastclock ?? '').trim();
    if (lastclock) {
      stored.lastclock = lastclock;
    }
    lastValues[itemid] = stored;
    const key = row.key_?.trim();
    const hostid = asZabbixId(row.hostid);
    if (!key || !isNumericZabbixItemId(hostid)) {
      continue;
    }
    const scoped = zabbixHostItemKey(hostid, key);
    lastValues[scoped] = stored;
    if (!itemIdByKey.has(scoped)) {
      itemIdByKey.set(scoped, itemid);
    }
  }
  return { lastValues, itemIdByKey };
}

async function fetchTrafficItemsByKeys(
  datasourceUid: string,
  itemKeys: string[],
  abortSignal: AbortSignal | undefined,
  hostids?: string[]
): Promise<ZabbixTrafficItemRow[]> {
  const keys = [...new Set(itemKeys.map((key) => key.trim()).filter(Boolean))];
  if (!datasourceUid || !keys.length) {
    return [];
  }
  const scopedHostIds = scopedTrafficHostIds(hostids);
  return zabbixCall<ZabbixTrafficItemRow[]>(
    datasourceUid,
    'item.get',
    {
      output: TRAFFIC_ITEM_OUTPUT,
      filter: { key_: keys },
      ...(scopedHostIds.length ? { hostids: scopedHostIds } : {}),
    },
    scopedHostIds.length ? ZABBIX_STATUS_CALL_TIMEOUT_MS : ZABBIX_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-traffic-keys-${datasourceUid}` }
  );
}

/**
 * Resolve chave de item → itemid numérico (`item.get` com filtro exato).
 *
 * O cabo às vezes fica só com a `key`. A chave do mapa é `hostid:key` — a `key_` do Zabbix
 * se repete entre hosts (mesmo ifIndex).
 */
export async function resolveZabbixItemIdsByKeys(
  datasourceUid: string,
  itemKeys: string[],
  abortSignal?: AbortSignal,
  hostids?: string[]
): Promise<Map<string, string>> {
  const rows = await fetchTrafficItemsByKeys(datasourceUid, itemKeys, abortSignal, hostids);
  return indexTrafficItemRows(rows).itemIdByKey;
}

function trafficRowsToInterfaceItems(rows: ZabbixTrafficItemRow[]): ZabbixInterfaceItem[] {
  const items: ZabbixInterfaceItem[] = [];
  for (const row of rows) {
    const key_ = row.key_?.trim();
    if (!key_) {
      continue;
    }
    const hostid = asZabbixId(row.hostid);
    const itemid = asZabbixId(row.itemid);
    const item: ZabbixInterfaceItem = {
      itemid: itemid || `${hostid}:${key_}`,
      key_,
    };
    if (row.name?.trim()) {
      item.name = row.name.trim();
    }
    if (hostid) {
      item.hostid = hostid;
    }
    if (row.lastvalue !== undefined) {
      item.lastvalue = row.lastvalue;
    }
    const lastclock = String(row.lastclock ?? '').trim();
    if (lastclock) {
      item.lastclock = lastclock;
    }
    items.push(item);
  }
  return items;
}

async function fetchTrafficItemsBySearch(
  datasourceUid: string,
  hostids: string[],
  terms: string[],
  abortSignal: AbortSignal | undefined
): Promise<ZabbixTrafficItemRow[]> {
  const scopedHostIds = scopedTrafficHostIds(hostids);
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  if (!datasourceUid || !scopedHostIds.length || !uniqueTerms.length) {
    return [];
  }
  /*
   * Um `item.get` por termo, em paralelo. Juntar tudo num `search` com `searchByAny` parece mais
   * econômico, mas o Zabbix resolve os `LIKE` em série dentro da mesma consulta: medido em 7 s
   * contra 3 s do paralelo, para as mesmas linhas. A varredura é rara, o tempo é que pesa.
   */
  const parts = await Promise.all(
    uniqueTerms.map((term) =>
      zabbixCall<ZabbixTrafficItemRow[]>(
        datasourceUid,
        'item.get',
        {
          output: TRAFFIC_ITEM_OUTPUT,
          hostids: scopedHostIds,
          search: { key_: term },
        },
        ZABBIX_STATUS_CALL_TIMEOUT_MS,
        { abortSignal, requestId: `topology-traffic-signal-${datasourceUid}-${term}` }
      )
    )
  );
  return parts.flat();
}

export async function fetchZabbixItemsByKeySearch(
  datasourceUid: string,
  hostids: string[],
  terms: string[],
  abortSignal?: AbortSignal
): Promise<ZabbixInterfaceItem[]> {
  const rows = await fetchTrafficItemsBySearch(datasourceUid, hostids, terms, abortSignal);
  return trafficRowsToInterfaceItems(rows);
}

/**
 * Inventário de sinal (óptico/rádio) dos hosts que os cabos usam.
 *
 * Um `item.get` só: `searchByAny` faz OR dos LIKE. Cinco POSTs em paralelo pintam o Network e
 * o grafana-zabbix cancela uns aos outros; a varredura é rara (10 min) e não bloqueia o mapa.
 * O lastvalue de cada item entra no `item.get` por itemid do ciclo seguinte.
 */
export async function fetchZabbixSignalInventory(
  datasourceUid: string,
  hostids: string[],
  terms: string[],
  abortSignal?: AbortSignal
): Promise<ZabbixInterfaceItem[]> {
  const scopedHostIds = scopedTrafficHostIds(hostids);
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  if (!datasourceUid || !scopedHostIds.length || !uniqueTerms.length) {
    return [];
  }
  const rows = await zabbixCall<ZabbixTrafficItemRow[]>(
    datasourceUid,
    'item.get',
    {
      output: TRAFFIC_ITEM_OUTPUT,
      hostids: scopedHostIds,
      search: { key_: uniqueTerms.length === 1 ? uniqueTerms[0] : uniqueTerms },
      ...(uniqueTerms.length > 1 ? { searchByAny: true } : {}),
    },
    ZABBIX_STATUS_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-traffic-signal-${datasourceUid}` }
  );
  return trafficRowsToInterfaceItems(rows);
}

/**
 * Termo de busca do item de status: chave Zabbix (`icmpping`) ou nome do item no editor.
 * Regex `/nome/i` do campo legado vira o trecho interno — o `item.get` não interpreta flags.
 */
export function statusItemSearch(statusItemKey: string): { key_?: string; name?: string } {
  const trimmed = statusItemKey.trim();
  const regex = trimmed.match(/^\/(.+)\/[a-z]*$/i);
  const term = (regex?.[1] ?? trimmed).trim();
  if (!term) {
    return {};
  }
  if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(term)) {
    return { key_: term };
  }
  return { name: term };
}

/**
 * Lastvalue do item de status, sem série histórica.
 *
 * Só `hostids` já resolvidos pelo `host.get`. `filter` é match exato — `search` LIKE em
 * `icmpping` também devolve `icmppingloss`/`icmppingsec` de todos os CPE e o proxy do
 * grafana-zabbix responde 500. Sem `groupids` e sem `monitored` (os hosts já são monitorados).
 */
export async function fetchZabbixStatusLastValues(
  datasourceUid: string,
  statusItemKey: string,
  hostids: string[],
  abortSignal?: AbortSignal,
  extraItemKeys?: string[]
): Promise<ZabbixInterfaceItem[]> {
  const base = statusItemSearch(statusItemKey);
  const extra = [...new Set((extraItemKeys ?? []).map((key) => key.trim()).filter(Boolean))];
  const filter: { key_?: string | string[]; name?: string } = { ...base };
  if (base.key_ && extra.length) {
    const keys = [...new Set([base.key_, ...extra])];
    filter.key_ = keys.length === 1 ? keys[0] : keys;
  }
  const scopedHostIds = scopedTrafficHostIds(hostids);
  if (!datasourceUid || (!filter.key_ && !filter.name) || !scopedHostIds.length) {
    return [];
  }
  const rows = await zabbixCall<ZabbixTrafficItemRow[]>(
    datasourceUid,
    'item.get',
    {
      output: TRAFFIC_ITEM_OUTPUT,
      hostids: scopedHostIds,
      filter,
    },
    ZABBIX_STATUS_CALL_TIMEOUT_MS,
    { abortSignal, requestId: `topology-status-last-${datasourceUid}` }
  );
  return trafficRowsToInterfaceItems(rows);
}

/**
 * Lastvalue RX/TX/status/sinal dos cabos — o Zabbix já guarda o valor atual no item
 * (preprocessing "Change per second" vira bps). Sem série de 5 min. Os itens de sinal entram
 * aqui por itemid, junto com o tráfego; quem os descobre é `fetchZabbixSignalInventory`.
 */
export async function fetchZabbixTrafficLastValues(
  datasourceUid: string,
  itemIds: string[],
  abortSignal?: AbortSignal,
  itemKeys?: string[],
  hostids?: string[]
): Promise<{
  lastValues: Record<string, ZabbixItemLastValue>;
  itemIdByKey: Map<string, string>;
  interfaceItems: ZabbixInterfaceItem[];
}> {
  const ids = [...new Set(itemIds.map((id) => id.trim()).filter((id) => isNumericZabbixItemId(id)))];
  const keys = [...new Set((itemKeys ?? []).map((key) => key.trim()).filter(Boolean))];
  if (!datasourceUid || (!ids.length && !keys.length)) {
    return { lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] };
  }

  /*
   * Um POST só. Com itemids, as chaves pendentes esperam: dois filtros no mesmo `item.get`
   * (itemids AND key_) se anulam, e dois POSTs em paralelo era o que o Network mostrava.
   */
  const rows = ids.length
    ? await zabbixCall<ZabbixTrafficItemRow[]>(
        datasourceUid,
        'item.get',
        { itemids: ids, output: TRAFFIC_ITEM_OUTPUT },
        ZABBIX_STATUS_CALL_TIMEOUT_MS,
        { abortSignal, requestId: `topology-traffic-ids-${datasourceUid}` }
      )
    : await fetchTrafficItemsByKeys(datasourceUid, keys, abortSignal, hostids);
  const indexed = indexTrafficItemRows(rows);
  return { ...indexed, interfaceItems: trafficRowsToInterfaceItems(rows) };
}

/**
 * Só os groupids. O `host.get` é pesado (interfaces/tags de todos os monitorados); o `item.get`
 * de status espera os hostids — nunca sai por `groupids`.
 */
export async function fetchZabbixResolvedGroups(
  datasourceUid: string,
  groupNames: string[],
  abortSignal?: AbortSignal,
  resolved?: ZabbixResolvedGroups
): Promise<ZabbixResolvedGroups> {
  const wanted = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!datasourceUid || !wanted.length) {
    return { resolvedGroups: [], groupIds: [] };
  }
  if (resolved?.groupIds.length) {
    return { resolvedGroups: resolved.resolvedGroups, groupIds: resolved.groupIds };
  }
  const groupIdByName = await fetchGroupIdsByName(datasourceUid, wanted, {
    abortSignal,
    requestId: `topology-groups-${datasourceUid}`,
  });
  return {
    resolvedGroups: [...groupIdByName.keys()],
    groupIds: [...groupIdByName.values()],
  };
}

interface ZabbixHostGroupRow {
  groupid?: string;
  name?: string;
}

async function fetchAllHostGroups(
  datasourceUid: string,
  callOptions: ZabbixCallOptions = {}
): Promise<ZabbixHostGroupRow[]> {
  return (
    (await zabbixCall<ZabbixHostGroupRow[]>(
      datasourceUid,
      'hostgroup.get',
      { output: ['groupid', 'name'] },
      ZABBIX_CALL_TIMEOUT_MS,
      callOptions
    )) ?? []
  );
}

async function fetchGroupIdsByName(
  datasourceUid: string,
  groupNames: string[],
  callOptions: ZabbixCallOptions = {}
): Promise<Map<string, string>> {
  const wantedKeys = new Set(groupNames.map((name) => name.trim().toUpperCase()).filter(Boolean));
  const groups = await fetchAllHostGroups(datasourceUid, callOptions);
  const byName = new Map<string, string>();
  for (const group of groups) {
    const name = group.name?.trim();
    const groupid = asZabbixId(group.groupid);
    if (!name || !groupid || !wantedKeys.has(name.toUpperCase())) {
      continue;
    }
    byName.set(name, groupid);
  }
  return byName;
}

/** Nomes de todos os grupos — alimenta o MultiSelect do editor, não o poll. */
export async function fetchZabbixHostGroupNames(
  datasourceUid: string,
  abortSignal?: AbortSignal
): Promise<string[]> {
  if (!datasourceUid) {
    return [];
  }
  const groups = await fetchAllHostGroups(datasourceUid, {
    abortSignal,
    requestId: `topology-group-names-${datasourceUid}`,
  });
  const names = new Set<string>();
  for (const group of groups) {
    const name = group.name?.trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function fetchMonitoredHostsInGroups(
  datasourceUid: string,
  groupIds: string[],
  wantedGroups: Set<string>,
  callOptions: ZabbixCallOptions = {}
): Promise<ZabbixDirectHost[]> {
  const rows = await zabbixCall<
    Array<ZabbixHost & { groups?: Array<{ name?: string }>; hostgroups?: Array<{ name?: string }> }>
  >(
    datasourceUid,
    'host.get',
    {
      groupids: groupIds,
      output: ZABBIX_HOST_OUTPUT,
      selectInterfaces: ['ip', 'main', 'type'],
      selectHostGroups: ['name'],
      selectTags: ['tag', 'value'],
      filter: { status: ZABBIX_HOST_MONITORED },
      monitored_hosts: true,
    },
    ZABBIX_STATUS_CALL_TIMEOUT_MS,
    callOptions
  );

  const hosts: ZabbixDirectHost[] = [];
  for (const row of rows ?? []) {
    const hostid = asZabbixId(row.hostid);
    const technical = row.host?.trim() ?? '';
    const visible = row.name?.trim() || technical;
    if (!hostid || !visible) {
      continue;
    }
    const rawGroups = row.hostgroups ?? row.groups ?? [];
    const groups = rawGroups
      .map((group) => group.name?.trim() ?? '')
      .filter((name) => wantedGroups.has(name));
    hosts.push({
      hostid,
      host: technical,
      name: visible,
      ip: pickMainInterfaceIp(row.interfaces),
      description: normalizeZabbixHostDescription(row.description),
      groups,
      tags: row.tags
        ?.map((tag) => ({ tag: tag.tag?.trim() ?? '', value: tag.value?.trim() ?? '' }))
        .filter((tag) => Boolean(tag.tag)),
    });
  }
  return hosts;
}

/**
 * Identidade dos hosts dos grupos: nome, IP, grupos e tags.
 *
 * `host.get` filtra só monitorados (`status: 0` + `monitored_hosts`). O hook relê isso no
 * intervalo configurado no plugin (`zabbixRefreshSec`). Sem isso, host desativado no Zabbix
 * continua no índice e o lastvalue devolve o último icmpping (0 = offline). A primeira pintura
 * lê a estrutura; a cor vem do `item.get` pelos hostids em seguida.
 */
export async function fetchZabbixDirectMetadata(
  datasourceUid: string,
  groupNames: string[],
  abortSignal?: AbortSignal,
  resolved?: ZabbixResolvedGroups
): Promise<ZabbixDirectMetadata> {
  const wanted = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!datasourceUid || !wanted.length) {
    return { hosts: [], resolvedGroups: [], groupIds: [] };
  }

  const callOptions: ZabbixCallOptions = {
    abortSignal,
    requestId: `topology-metadata-${datasourceUid}`,
  };

  const groups = await fetchZabbixResolvedGroups(datasourceUid, wanted, abortSignal, resolved);
  if (!groups.resolvedGroups.length) {
    return { hosts: [], resolvedGroups: groups.resolvedGroups, groupIds: groups.groupIds };
  }

  const hosts = await fetchMonitoredHostsInGroups(
    datasourceUid,
    groups.groupIds,
    new Set(groups.resolvedGroups),
    callOptions
  );
  return { hosts, resolvedGroups: groups.resolvedGroups, groupIds: groups.groupIds };
}
