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
    ZABBIX_CALL_TIMEOUT_MS,
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

/**
 * Inventário de sinal (óptico/rádio) dos hosts que os cabos usam.
 *
 * Fora do ciclo de status: a varredura devolve toda porta óptica do host e demora segundos, então
 * bloquear o mapa nela atrasava a primeira carga inteira. Daqui saem só os itens; o valor de cada
 * um chega no `item.get` por itemid do ciclo seguinte.
 */
export async function fetchZabbixSignalInventory(
  datasourceUid: string,
  hostids: string[],
  terms: string[],
  abortSignal?: AbortSignal
): Promise<ZabbixInterfaceItem[]> {
  const rows = await fetchTrafficItemsBySearch(datasourceUid, hostids, terms, abortSignal);
  return trafficRowsToInterfaceItems(rows);
}

/**
 * Lastvalue do item de status, sem série histórica.
 *
 * Aceita `groupids` para não esperar o `host.get`: no recarregar a frio o inventário de hosts
 * leva segundos, e o mapa precisa da cor antes disso. Sem grupo, cai nos `hostids`.
 */
export async function fetchZabbixStatusLastValues(
  datasourceUid: string,
  statusItemKey: string,
  hostids: string[],
  abortSignal?: AbortSignal,
  groupids?: string[]
): Promise<ZabbixInterfaceItem[]> {
  const key = statusItemKey.trim();
  const scopedGroups = scopedTrafficHostIds(groupids);
  const scopedHostIds = scopedTrafficHostIds(hostids);
  if (!datasourceUid || !key || (!scopedGroups.length && !scopedHostIds.length)) {
    return [];
  }
  const rows = await zabbixCall<ZabbixTrafficItemRow[]>(
    datasourceUid,
    'item.get',
    {
      output: TRAFFIC_ITEM_OUTPUT,
      ...(scopedGroups.length ? { groupids: scopedGroups } : { hostids: scopedHostIds }),
      search: { key_: key },
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

  const rowBatches: Array<Promise<ZabbixTrafficItemRow[]>> = [];
  if (ids.length) {
    /*
     * Lista inteira num `item.get` só, sem fatiar: a resposta depende de quantos itens existem,
     * não do tamanho da lista enviada. Fatiar fazia o número de requisições crescer junto com o
     * ambiente — 50 mil ids num POST passam sem problema.
     */
    rowBatches.push(
      zabbixCall<ZabbixTrafficItemRow[]>(
        datasourceUid,
        'item.get',
        { itemids: ids, output: TRAFFIC_ITEM_OUTPUT },
        ZABBIX_STATUS_CALL_TIMEOUT_MS,
        { abortSignal, requestId: `topology-traffic-ids-${datasourceUid}` }
      )
    );
  }
  if (keys.length) {
    rowBatches.push(fetchTrafficItemsByKeys(datasourceUid, keys, abortSignal, hostids));
  }
  const rows = (await Promise.all(rowBatches)).flat();
  const indexed = indexTrafficItemRows(rows);
  return { ...indexed, interfaceItems: trafficRowsToInterfaceItems(rows) };
}

/**
 * Só os groupids. O `host.get` é pesado (interfaces/tags de todos os monitorados) e não precisa
 * bloquear o `item.get` de status — os dois correm em paralelo na primeira carga.
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

async function fetchGroupIdsByName(
  datasourceUid: string,
  groupNames: string[],
  callOptions: ZabbixCallOptions = {}
): Promise<Map<string, string>> {
  const wantedKeys = new Set(groupNames.map((name) => name.trim().toUpperCase()).filter(Boolean));
  const groups = await zabbixCall<Array<{ groupid?: string; name?: string }>>(
    datasourceUid,
    'hostgroup.get',
    { output: ['groupid', 'name'] },
    ZABBIX_CALL_TIMEOUT_MS,
    callOptions
  );
  const byName = new Map<string, string>();
  for (const group of groups ?? []) {
    const name = group.name?.trim();
    const groupid = asZabbixId(group.groupid);
    if (!name || !groupid || !wantedKeys.has(name.toUpperCase())) {
      continue;
    }
    byName.set(name, groupid);
  }
  return byName;
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
 * `host.get` filtra só monitorados (`status: 0` + `monitored_hosts`). O hook relê isso a cada
 * ciclo — sem isso, host desativado no Zabbix continua no índice e o Metrics devolve o último
 * icmpping (0 = offline). A primeira pintura lê o lastvalue; problemas continuam no `ds.query()`.
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
