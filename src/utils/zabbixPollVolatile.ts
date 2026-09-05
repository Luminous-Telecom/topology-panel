import { HostProblemsMap } from './noc/types';
import { sameStructure } from './structuralIdentity';
import { ZabbixInterfaceItem, ZabbixItemLastValue, ZabbixLiveSnapshot } from './zabbixApi';

export interface ZabbixPollSnapshot {
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
}

export interface ZabbixPollFeed {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ZabbixPollSnapshot;
}

export interface PanelPollStateSlice {
  index: unknown;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
}

export function isTrafficPollKey(
  key: string,
  row: ZabbixItemLastValue | undefined,
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  const itemId = row?.itemid?.trim();
  if (itemId && trafficItemIds.has(itemId)) {
    return true;
  }
  if (trafficItemIds.has(key.trim())) {
    return true;
  }
  return trafficKeys.has(key.trim());
}

export function isTrafficInterfaceItem(
  item: ZabbixInterfaceItem | undefined,
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  if (!item) {
    return false;
  }
  const itemId = item.itemid?.trim();
  if (itemId && trafficItemIds.has(itemId)) {
    return true;
  }
  const key = item.key_?.trim();
  return Boolean(key && trafficKeys.has(key));
}

function nonTrafficInterfaceItemsChanged(
  prev: ZabbixInterfaceItem[],
  next: ZabbixInterfaceItem[],
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  if (prev === next) {
    return false;
  }
  const prevById = new Map<string, ZabbixInterfaceItem>();
  for (const item of prev) {
    const id = item.itemid.trim();
    if (!id || isTrafficInterfaceItem(item, trafficItemIds, trafficKeys)) {
      continue;
    }
    prevById.set(id, item);
  }
  const nextById = new Map<string, ZabbixInterfaceItem>();
  for (const item of next) {
    const id = item.itemid.trim();
    if (!id || isTrafficInterfaceItem(item, trafficItemIds, trafficKeys)) {
      continue;
    }
    nextById.set(id, item);
  }
  if (prevById.size !== nextById.size) {
    return true;
  }
  for (const [id, prevItem] of prevById) {
    const nextItem = nextById.get(id);
    if (!nextItem) {
      return true;
    }
    if (prevItem.lastvalue !== nextItem.lastvalue) {
      return true;
    }
  }
  return false;
}

/** Snapshot intermediário do bootstrap: só `problem.get` preencheu o mapa de problemas. */
export function snapshotOnlyProblemsChanged(
  prev: ZabbixLiveSnapshot | undefined,
  next: ZabbixLiveSnapshot,
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  if (!prev) {
    return false;
  }
  if (sameStructure(prev.problems ?? {}, next.problems ?? {})) {
    return false;
  }
  if (prev.metadata !== next.metadata || prev.knownStatusItems !== next.knownStatusItems) {
    return false;
  }
  if (
    nonTrafficInterfaceItemsChanged(
      prev.interfaceItems ?? [],
      next.interfaceItems ?? [],
      trafficItemIds,
      trafficKeys
    )
  ) {
    return false;
  }
  const keys = new Set([...Object.keys(prev.lastValues ?? {}), ...Object.keys(next.lastValues ?? {})]);
  for (const key of keys) {
    const prevRow = prev.lastValues?.[key];
    const nextRow = next.lastValues?.[key];
    if (isTrafficPollKey(key, nextRow ?? prevRow, trafficItemIds, trafficKeys)) {
      continue;
    }
    if (prevRow?.lastvalue !== nextRow?.lastvalue) {
      return false;
    }
  }
  return true;
}

export function pollVolatileFeedChanged(
  prev: PanelPollStateSlice,
  next: PanelPollStateSlice,
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  if (prev.lastValues === next.lastValues && prev.interfaceItems === next.interfaceItems) {
    return false;
  }
  const keys = new Set([...Object.keys(prev.lastValues), ...Object.keys(next.lastValues)]);
  for (const key of keys) {
    const prevRow = prev.lastValues[key];
    const nextRow = next.lastValues[key];
    if (!isTrafficPollKey(key, nextRow ?? prevRow, trafficItemIds, trafficKeys)) {
      continue;
    }
    if (prevRow?.lastvalue !== nextRow?.lastvalue) {
      return true;
    }
  }
  const prevById = new Map<string, ZabbixInterfaceItem>();
  for (const item of prev.interfaceItems) {
    if (!isTrafficInterfaceItem(item, trafficItemIds, trafficKeys)) {
      continue;
    }
    const id = item.itemid.trim();
    if (id) {
      prevById.set(id, item);
    }
  }
  for (const item of next.interfaceItems) {
    if (!isTrafficInterfaceItem(item, trafficItemIds, trafficKeys)) {
      continue;
    }
    const id = item.itemid.trim();
    if (!id) {
      continue;
    }
    const prevItem = prevById.get(id);
    if (!prevItem || prevItem.lastvalue !== item.lastvalue) {
      return true;
    }
    prevById.delete(id);
  }
  return prevById.size > 0;
}

/** Só problemas mudaram — tráfego, status e índice estão iguais. */
export function isProblemsOnlyPanelDelta(
  prev: PanelPollStateSlice,
  next: PanelPollStateSlice,
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  if (sameStructure(prev.problems, next.problems)) {
    return false;
  }
  return !panelStateNeedsRerender(
    prev,
    { ...next, problems: prev.problems },
    trafficItemIds,
    trafficKeys
  );
}

/**
 * O painel só precisa re-renderizar quando status, índice, problemas ou inventário mudam.
 * Lastvalues de tráfego (RX/TX dos cabos) vão para o feed volátil — pílulas e animação
 * assinam sem remontar o canvas.
 */
export function panelStateNeedsRerender(
  prev: PanelPollStateSlice,
  next: PanelPollStateSlice,
  trafficItemIds: ReadonlySet<string>,
  trafficKeys: ReadonlySet<string>
): boolean {
  if (prev.ready !== next.ready || prev.loading !== next.loading || prev.error !== next.error) {
    return true;
  }
  if (prev.index !== next.index) {
    return true;
  }
  if (!sameStructure(prev.problems, next.problems)) {
    return true;
  }
  if (nonTrafficInterfaceItemsChanged(prev.interfaceItems, next.interfaceItems, trafficItemIds, trafficKeys)) {
    return true;
  }

  const keys = new Set([...Object.keys(prev.lastValues), ...Object.keys(next.lastValues)]);
  for (const key of keys) {
    const prevRow = prev.lastValues[key];
    const nextRow = next.lastValues[key];
    if (isTrafficPollKey(key, nextRow ?? prevRow, trafficItemIds, trafficKeys)) {
      continue;
    }
    if (prevRow?.lastvalue !== nextRow?.lastvalue) {
      return true;
    }
  }
  return false;
}
