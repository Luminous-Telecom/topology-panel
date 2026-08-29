import {
  itemIdByKeyFromLastValues,
  isNumericZabbixItemId,
  mergeItemIdByKey,
} from '../utils/zabbixApi/itemIds';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';

/**
 * Catálogo de itemids (sem lastvalue). O F5 relê lastvalue ao vivo por id — não pinta valor velho.
 * A chave lógica usa `\u0000`; no storage vira `encodeURIComponent`.
 */

/** Itemid não muda com o lastvalue. */
export const ZABBIX_ITEMID_CATALOG_TTL_MS = 7 * 24 * 60 * 60_000;
const CATALOG_STORAGE_PREFIX = 'luminous-topology.zabbixItemIds.v1:';
/** Snapshots de lastvalue antigos — só para limpar quota; o poll não grava mais isso. */
const LEGACY_SNAPSHOT_PREFIXES = [
  'luminous-topology.zabbixSnapshot.v2:',
  'luminous-topology.zabbixSnapshot.v1:',
] as const;

export interface ZabbixItemIdCatalogSource {
  statusItems: ZabbixInterfaceItem[];
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
}

/** Itemids conhecidos — sem lastvalue. */
export interface ZabbixItemIdCatalog {
  statusItems: ZabbixInterfaceItem[];
  itemIdByKey: Record<string, string>;
}

interface StoredCatalogEnvelope {
  savedAt: number;
  payload: ZabbixItemIdCatalog;
}

const catalogMemory = new Map<string, StoredCatalogEnvelope>();

export function zabbixSnapshotCacheKey(
  datasourceUid: string,
  groupNames: readonly string[],
  statusItemKey: string
): string {
  return `${datasourceUid}\u0000${groupNames.join('\u0001')}\u0000${statusItemKey}`;
}

function catalogStorageKeyFor(key: string): string {
  return `${CATALOG_STORAGE_PREFIX}${encodeURIComponent(key)}`;
}

function browserStorage(): Storage | undefined {
  try {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    return localStorage;
  } catch {
    return undefined;
  }
}

function isFresh(savedAt: number, now: number, ttlMs: number): boolean {
  return now - savedAt < ttlMs;
}

function catalogStatusItem(item: ZabbixInterfaceItem): ZabbixInterfaceItem | undefined {
  const itemid = item.itemid.trim();
  const hostid = item.hostid?.trim();
  if (!hostid || !isNumericZabbixItemId(itemid) || !isNumericZabbixItemId(hostid)) {
    return undefined;
  }
  return { itemid, key_: item.key_, hostid };
}

/** Extrai só os ids — lastvalue fica de fora de propósito. */
export function catalogFromSnapshot(payload: ZabbixItemIdCatalogSource): ZabbixItemIdCatalog | undefined {
  const statusItems: ZabbixInterfaceItem[] = [];
  for (const item of payload.statusItems) {
    const compact = catalogStatusItem(item);
    if (compact) {
      statusItems.push(compact);
    }
  }
  if (!statusItems.length) {
    return undefined;
  }
  const itemIdByKey = itemIdByKeyFromLastValues(payload.lastValues);
  mergeItemIdByKey(itemIdByKey, payload.statusItems);
  mergeItemIdByKey(itemIdByKey, payload.interfaceItems);
  return { statusItems, itemIdByKey: Object.fromEntries(itemIdByKey) };
}

function storageKeysWithPrefix(storage: Storage, prefixes: readonly string[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  return keys;
}

function pruneKeys(storage: Storage, prefixes: readonly string[], keep?: string): void {
  for (const key of storageKeysWithPrefix(storage, prefixes)) {
    if (key !== keep) {
      storage.removeItem(key);
    }
  }
}

function trySetItem(storage: Storage, storageKey: string, raw: string): boolean {
  try {
    storage.setItem(storageKey, raw);
    return true;
  } catch {
    return false;
  }
}

function compactCatalog(catalog: ZabbixItemIdCatalog): ZabbixItemIdCatalog {
  const statusItems: ZabbixInterfaceItem[] = [];
  for (const item of catalog.statusItems) {
    const compact = catalogStatusItem(item);
    if (compact) {
      statusItems.push(compact);
    }
  }
  const itemIdByKey: Record<string, string> = {};
  for (const [scoped, id] of Object.entries(catalog.itemIdByKey)) {
    const trimmed = id.trim();
    if (!scoped.includes(':') || !isNumericZabbixItemId(trimmed)) {
      continue;
    }
    itemIdByKey[scoped] = trimmed;
  }
  return { statusItems, itemIdByKey };
}

function itemIdCatalogsEqual(left: ZabbixItemIdCatalog, right: ZabbixItemIdCatalog): boolean {
  if (left.statusItems.length !== right.statusItems.length) {
    return false;
  }
  const leftIds = new Set(left.statusItems.map((item) => item.itemid));
  for (const item of right.statusItems) {
    if (!leftIds.has(item.itemid)) {
      return false;
    }
  }
  const leftKeys = Object.keys(left.itemIdByKey);
  if (leftKeys.length !== Object.keys(right.itemIdByKey).length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left.itemIdByKey[key] !== right.itemIdByKey[key]) {
      return false;
    }
  }
  return true;
}

function writeCatalogStorage(key: string, envelope: StoredCatalogEnvelope): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  const storageKey = catalogStorageKeyFor(key);
  const raw = JSON.stringify({
    savedAt: envelope.savedAt,
    payload: compactCatalog(envelope.payload),
  });
  if (trySetItem(storage, storageKey, raw)) {
    return;
  }
  pruneKeys(storage, [CATALOG_STORAGE_PREFIX], storageKey);
  trySetItem(storage, storageKey, raw);
}

function writeItemIdCatalog(key: string, catalog: ZabbixItemIdCatalog, now: number): void {
  if (!catalog.statusItems.length) {
    return;
  }
  const payload = compactCatalog(catalog);
  const previous = catalogMemory.get(key)?.payload;
  if (previous && itemIdCatalogsEqual(previous, payload)) {
    return;
  }
  const envelope: StoredCatalogEnvelope = { savedAt: now, payload };
  catalogMemory.set(key, envelope);
  writeCatalogStorage(key, envelope);
}

/** Grava só o catálogo de ids. Sem lastvalue. */
export function persistZabbixItemIdCatalog(
  key: string,
  payload: ZabbixItemIdCatalogSource,
  now: number = Date.now()
): void {
  const storage = browserStorage();
  if (storage) {
    pruneKeys(storage, LEGACY_SNAPSHOT_PREFIXES);
  }
  const catalog = catalogFromSnapshot(payload);
  if (catalog) {
    writeItemIdCatalog(key, catalog, now);
  }
}

function readCatalogStorage(key: string, now: number): ZabbixItemIdCatalog | undefined {
  const storage = browserStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const storageKey = catalogStorageKeyFor(key);
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    const envelope = JSON.parse(raw) as StoredCatalogEnvelope;
    if (!envelope?.payload?.statusItems?.length || !isFresh(envelope.savedAt, now, ZABBIX_ITEMID_CATALOG_TTL_MS)) {
      storage.removeItem(storageKey);
      return undefined;
    }
    return compactCatalog(envelope.payload);
  } catch {
    return undefined;
  }
}

export function readZabbixItemIdCatalog(key: string, now: number = Date.now()): ZabbixItemIdCatalog | undefined {
  const mem = catalogMemory.get(key);
  if (mem && isFresh(mem.savedAt, now, ZABBIX_ITEMID_CATALOG_TTL_MS)) {
    return mem.payload;
  }
  if (mem) {
    catalogMemory.delete(key);
  }
  const stored = readCatalogStorage(key, now);
  if (stored) {
    catalogMemory.set(key, { savedAt: now, payload: stored });
  }
  return stored;
}

/** Esquece a memória; o localStorage permanece — simula o reload do plugin no Grafana. */
export function dropZabbixSnapshotMemory(): void {
  catalogMemory.clear();
}

/** Testes e troca de datasource — descarta memória e as chaves deste prefixo. */
export function clearZabbixSnapshotCache(): void {
  dropZabbixSnapshotMemory();
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  try {
    pruneKeys(storage, [...LEGACY_SNAPSHOT_PREFIXES, CATALOG_STORAGE_PREFIX]);
  } catch {
    /* ignore */
  }
}
