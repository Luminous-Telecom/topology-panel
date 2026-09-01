import {
  isNumericZabbixItemId,
  itemIdByKeyFromLastValues,
  mergeItemIdByKey,
  zabbixHostItemKey,
  type ZabbixDirectHost,
  type ZabbixInterfaceItem,
  type ZabbixItemLastValue,
} from '../utils/zabbixApi';
import { aliasLastValuesByItemKey, coalesceLinkTraffic } from '../utils/linkMetricsRuntime';
import type { ZabbixLiveSnapshot } from '../utils/zabbixApi';
import { zabbixCall, type ZabbixRpc } from './zabbixCall';
import {
  fetchDirectMetadata,
  fetchProblems,
  fetchResolvedGroups,
  fetchStatusLastValues,
  fetchTrafficLastValues,
  statusItemSearch,
} from './zabbixQuery';

export const ZABBIX_GENERIC_ERROR =
  'Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados.';
export const ZABBIX_NO_GROUPS_ERROR = 'Nenhum dos grupos configurados existe no Zabbix.';
export const ZABBIX_NO_STATUS_ITEMS_ERROR =
  'Nenhum host dos grupos respondeu com o item de status. Confira o nome do item em "Item de status".';

export type ZabbixPollInput = {
  datasourceUid: string;
  groupNames: string[];
  statusItemKey: string;
  trafficItemIds: string[];
  trafficKeys: string[];
  previous?: ZabbixLiveSnapshot;
  /** Chamado quando o lastvalue de status já chegou — a UI pinta sem esperar problemas. */
  onSnapshot?: (snapshot: ZabbixLiveSnapshot) => void;
};

function emptySnapshot(): ZabbixLiveSnapshot {
  return {
    savedAt: 0,
    metadata: { hosts: [], resolvedGroups: [], groupIds: [] },
    knownStatusItems: [],
    lastValues: {},
    interfaceItems: [],
    problems: {},
  };
}

function hostIds(hosts: ZabbixDirectHost[]): string[] {
  return hosts.map((host) => host.hostid);
}

function numericItemIds(items: ZabbixInterfaceItem[]): string[] {
  return [...new Set(items.map((item) => item.itemid.trim()).filter((id) => isNumericZabbixItemId(id)))];
}

/** Há itemids de status para o intervalo — host sem o item não força descoberta de novo. */
function canRefreshByItemIds(items: ZabbixInterfaceItem[]): boolean {
  return items.length > 0 && numericItemIds(items).length === items.length;
}

export function statusLastValuesPresent(
  lastValues: Record<string, ZabbixItemLastValue>,
  items: ZabbixInterfaceItem[]
): boolean {
  return items.some((item) => {
    const id = item.itemid.trim();
    if (isNumericZabbixItemId(id) && lastValues[id]?.lastvalue !== undefined) {
      return true;
    }
    return item.lastvalue !== undefined;
  });
}

export function applyLastValuesToStatusItems(
  items: ZabbixInterfaceItem[],
  lastValues: Record<string, ZabbixItemLastValue>,
  interfaceItems: ZabbixInterfaceItem[]
): ZabbixInterfaceItem[] {
  const byId = new Map<string, ZabbixInterfaceItem>();
  for (const item of interfaceItems) {
    const id = item.itemid.trim();
    if (isNumericZabbixItemId(id)) {
      byId.set(id, item);
    }
  }
  return items.map((item) => {
    const id = item.itemid.trim();
    const fromTraffic = byId.get(id);
    if (fromTraffic) {
      return {
        ...item,
        lastvalue: fromTraffic.lastvalue ?? item.lastvalue,
        lastclock: fromTraffic.lastclock ?? item.lastclock,
      };
    }
    const lv = lastValues[id];
    if (!lv) {
      return item;
    }
    return {
      ...item,
      lastvalue: lv.lastvalue ?? item.lastvalue,
      lastclock: lv.lastclock ?? item.lastclock,
    };
  });
}

function trafficKeyResolved(itemIdByKey: Map<string, string>, key: string): boolean {
  if (itemIdByKey.has(key)) {
    return true;
  }
  const suffix = `:${key}`;
  for (const scoped of itemIdByKey.keys()) {
    if (scoped.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

function pendingTrafficKeys(keys: string[], itemIdByKey: Map<string, string>): string[] {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))].filter(
    (key) => !trafficKeyResolved(itemIdByKey, key)
  );
}

function snapshotFromParts(
  previous: ZabbixLiveSnapshot,
  patch: Partial<ZabbixLiveSnapshot>
): ZabbixLiveSnapshot {
  const traffic = coalesceLinkTraffic(
    {
      lastValues: patch.lastValues ?? previous.lastValues,
      interfaceItems: patch.interfaceItems ?? previous.interfaceItems,
    },
    { lastValues: previous.lastValues, interfaceItems: previous.interfaceItems }
  );
  const statusItems = applyLastValuesToStatusItems(
    patch.knownStatusItems ?? previous.knownStatusItems,
    traffic.lastValues,
    traffic.interfaceItems
  );
  const fromStatus: Record<string, ZabbixItemLastValue> = {};
  for (const item of statusItems) {
    const id = item.itemid.trim();
    if (!isNumericZabbixItemId(id) || item.lastvalue === undefined) {
      continue;
    }
    const stored: ZabbixItemLastValue = {
      itemid: id,
      lastvalue: item.lastvalue,
      lastclock: item.lastclock,
    };
    fromStatus[id] = stored;
    if (item.hostid && item.key_) {
      fromStatus[zabbixHostItemKey(item.hostid, item.key_)] = stored;
    }
  }
  return {
    savedAt: Date.now(),
    metadata: patch.metadata ?? previous.metadata,
    knownStatusItems: statusItems,
    lastValues: { ...fromStatus, ...traffic.lastValues },
    interfaceItems: traffic.interfaceItems,
    problems: patch.problems ?? previous.problems,
  };
}

export async function runZabbixPoll(
  input: ZabbixPollInput,
  call: ZabbixRpc = zabbixCall
): Promise<{ snapshot: ZabbixLiveSnapshot; error?: string }> {
  const previous = input.previous ?? emptySnapshot();
  const itemIdByKey = itemIdByKeyFromLastValues(previous.lastValues);
  mergeItemIdByKey(itemIdByKey, previous.interfaceItems);
  mergeItemIdByKey(itemIdByKey, previous.knownStatusItems);
  const pendingKeys = pendingTrafficKeys(input.trafficKeys, itemIdByKey);
  let hostids = hostIds(previous.metadata.hosts);

  const collectNumericIds = (): string[] => {
    const ids = new Set<string>();
    for (const id of input.trafficItemIds) {
      const trimmed = id.trim();
      if (isNumericZabbixItemId(trimmed)) {
        ids.add(trimmed);
      }
    }
    for (const id of itemIdByKey.values()) {
      if (isNumericZabbixItemId(id)) {
        ids.add(id);
      }
    }
    for (const id of numericItemIds(previous.knownStatusItems)) {
      ids.add(id);
    }
    return [...ids];
  };

  if (previous.metadata.resolvedGroups.length && canRefreshByItemIds(previous.knownStatusItems)) {
    const numeric = collectNumericIds();
    if (numeric.length) {
      const fetched = await fetchTrafficLastValues(
        input.datasourceUid,
        numeric,
        pendingKeys,
        hostids,
        call
      );
      mergeItemIdByKey(itemIdByKey, fetched.interfaceItems);
      const lastValues = aliasLastValuesByItemKey(fetched.lastValues, itemIdByKey);
      if (statusLastValuesPresent(lastValues, previous.knownStatusItems)) {
        return {
          snapshot: snapshotFromParts(previous, {
            lastValues,
            interfaceItems: fetched.interfaceItems,
          }),
        };
      }
    }
  }

  const cachedGroups = previous.metadata.resolvedGroups.length
    ? { resolvedGroups: previous.metadata.resolvedGroups, groupIds: previous.metadata.groupIds }
    : undefined;
  const groups = await fetchResolvedGroups(
    input.datasourceUid,
    input.groupNames,
    cachedGroups,
    call
  );
  if (!groups.resolvedGroups.length) {
    return {
      snapshot: snapshotFromParts(previous, {
        metadata: { hosts: [], resolvedGroups: [], groupIds: [] },
        knownStatusItems: [],
        problems: {},
      }),
      error: ZABBIX_NO_GROUPS_ERROR,
    };
  }

  const { keyFilter } = statusItemSearch(input.statusItemKey);
  const extraInStatus = keyFilter ? pendingKeys : [];
  const metadataP = fetchDirectMetadata(
    input.datasourceUid,
    input.groupNames,
    groups,
    call
  );
  const statusP = fetchStatusLastValues(
    input.datasourceUid,
    input.statusItemKey,
    [],
    extraInStatus,
    call,
    groups.groupIds
  );
  const problemsP = fetchProblems(input.datasourceUid, [], call, groups.groupIds).catch(
    () => previous.problems
  );
  const numeric = collectNumericIds();
  const emptyTraffic = {
    lastValues: {} as Record<string, ZabbixItemLastValue>,
    interfaceItems: [] as ZabbixInterfaceItem[],
  };
  const trafficP =
    pendingKeys.length && !keyFilter
      ? fetchTrafficLastValues(
          input.datasourceUid,
          [],
          pendingKeys,
          [],
          call,
          groups.groupIds
        )
      : numeric.length
        ? fetchTrafficLastValues(input.datasourceUid, numeric, [], [], call)
        : Promise.resolve(emptyTraffic);

  const [metadata, fetchedStatus, traffic] = await Promise.all([metadataP, statusP, trafficP]);

  let statusItems = fetchedStatus;
  let extraLastValues: Record<string, ZabbixItemLastValue> = {};
  let extraItems: ZabbixInterfaceItem[] = [];
  if (keyFilter && extraInStatus.length) {
    statusItems = fetchedStatus.filter((item) => item.key_ === keyFilter);
    extraItems = fetchedStatus.filter((item) => item.key_ !== keyFilter);
    mergeItemIdByKey(itemIdByKey, extraItems);
    for (const item of extraItems) {
      const id = item.itemid.trim();
      if (!isNumericZabbixItemId(id)) {
        continue;
      }
      const stored: ZabbixItemLastValue = {
        itemid: id,
        lastvalue: item.lastvalue,
        lastclock: item.lastclock,
      };
      extraLastValues[id] = stored;
      if (item.hostid && item.key_) {
        extraLastValues[zabbixHostItemKey(item.hostid, item.key_)] = stored;
      }
    }
  }
  if (!statusItems.length && previous.knownStatusItems.length) {
    statusItems = previous.knownStatusItems;
  }
  if (metadata.hosts.length && !statusItems.length) {
    return {
      snapshot: snapshotFromParts(previous, { metadata, problems: await problemsP }),
      error: ZABBIX_NO_STATUS_ITEMS_ERROR,
    };
  }

  mergeItemIdByKey(itemIdByKey, traffic.interfaceItems);
  const trafficLast = {
    ...extraLastValues,
    ...aliasLastValuesByItemKey(traffic.lastValues, itemIdByKey),
  };
  const trafficItems = [...extraItems, ...traffic.interfaceItems];
  const painted = snapshotFromParts(previous, {
    metadata,
    knownStatusItems: statusItems,
    lastValues: trafficLast,
    interfaceItems: trafficItems,
    problems: previous.problems,
  });
  input.onSnapshot?.(painted);

  return {
    snapshot: snapshotFromParts(previous, {
      metadata,
      knownStatusItems: statusItems,
      lastValues: trafficLast,
      interfaceItems: trafficItems,
      problems: await problemsP,
    }),
  };
}
