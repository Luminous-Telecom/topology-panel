import { HostProblemsMap } from '../utils/noc/types';
import { ZabbixDirectHost, ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';

/**
 * Último snapshot completo (status + tráfego) para pintar o mapa ao abrir o dashboard
 * sem esperar o Zabbix. Memória cobre remontagem do painel; localStorage cobre F5, nova aba
 * e o restart do Grafana no deploy, com TTL curto.
 *
 * A chave lógica usa `\u0000`; no storage vira `encodeURIComponent` — browser e wrappers do
 * Grafana rejeitam ou truncam NUL no nome da chave, e o snapshot sumia no reload.
 */

export const ZABBIX_SNAPSHOT_TTL_MS = 30 * 60_000;
const STORAGE_PREFIX = 'luminous-topology.zabbixSnapshot.v2:';
const LEGACY_STORAGE_PREFIX = 'luminous-topology.zabbixSnapshot.v1:';

export interface ZabbixSnapshotPayload {
  datasourceUid: string;
  groupNames: string[];
  statusItemKey: string;
  hosts: ZabbixDirectHost[];
  statusItems: ZabbixInterfaceItem[];
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
}

interface StoredEnvelope {
  savedAt: number;
  payload: ZabbixSnapshotPayload;
}

const memory = new Map<string, StoredEnvelope>();

export function zabbixSnapshotCacheKey(
  datasourceUid: string,
  groupNames: readonly string[],
  statusItemKey: string
): string {
  return `${datasourceUid}\u0000${groupNames.join('\u0001')}\u0000${statusItemKey}`;
}

function storageKeyFor(key: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(key)}`;
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

function isFresh(savedAt: number, now: number): boolean {
  return now - savedAt < ZABBIX_SNAPSHOT_TTL_MS;
}

function compactHost(host: ZabbixDirectHost): ZabbixDirectHost {
  const next: ZabbixDirectHost = {
    hostid: host.hostid,
    host: host.host,
    name: host.name,
    groups: host.groups,
  };
  if (host.ip) {
    next.ip = host.ip;
  }
  return next;
}

function compactStatusItem(item: ZabbixInterfaceItem): ZabbixInterfaceItem {
  const next: ZabbixInterfaceItem = { itemid: item.itemid, key_: item.key_ };
  if (item.hostid) {
    next.hostid = item.hostid;
  }
  if (item.lastvalue != null) {
    next.lastvalue = item.lastvalue;
  }
  if (item.lastclock != null) {
    next.lastclock = item.lastclock;
  }
  if (item.value_type != null) {
    next.value_type = item.value_type;
  }
  return next;
}

function compactLastValue(value: ZabbixItemLastValue): ZabbixItemLastValue {
  const next: ZabbixItemLastValue = { itemid: value.itemid };
  if (value.lastvalue != null) {
    next.lastvalue = value.lastvalue;
  }
  if (value.lastclock != null) {
    next.lastclock = value.lastclock;
  }
  if (value.value_type != null) {
    next.value_type = value.value_type;
  }
  return next;
}

/** Tira descrição/tags/nome de item — o status do mapa não precisa disso para reabrir. */
function compactPayload(payload: ZabbixSnapshotPayload, includeInterfaceItems: boolean): ZabbixSnapshotPayload {
  const lastValues: Record<string, ZabbixItemLastValue> = {};
  for (const [itemKey, value] of Object.entries(payload.lastValues)) {
    lastValues[itemKey] = compactLastValue(value);
  }
  return {
    datasourceUid: payload.datasourceUid,
    groupNames: payload.groupNames,
    statusItemKey: payload.statusItemKey,
    hosts: payload.hosts.map(compactHost),
    statusItems: payload.statusItems.map(compactStatusItem),
    lastValues,
    interfaceItems: includeInterfaceItems ? payload.interfaceItems.map(compactStatusItem) : [],
    problems: payload.problems,
  };
}

function snapshotStorageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(STORAGE_PREFIX) || key?.startsWith(LEGACY_STORAGE_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

function pruneSnapshotKeys(storage: Storage, keep?: string): void {
  for (const key of snapshotStorageKeys(storage)) {
    if (key !== keep) {
      storage.removeItem(key);
    }
  }
}

function parseEnvelope(raw: string, now: number, storage: Storage, storageKey: string): ZabbixSnapshotPayload | undefined {
  const envelope = JSON.parse(raw) as StoredEnvelope;
  if (!envelope?.payload?.hosts?.length || !isFresh(envelope.savedAt, now)) {
    storage.removeItem(storageKey);
    return undefined;
  }
  return envelope.payload;
}

function readStorage(key: string, now: number): ZabbixSnapshotPayload | undefined {
  const storage = browserStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const storageKey = storageKeyFor(key);
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    return parseEnvelope(raw, now, storage, storageKey);
  } catch {
    return undefined;
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

function writeStorage(key: string, envelope: StoredEnvelope): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  const storageKey = storageKeyFor(key);
  const attempts: StoredEnvelope[] = [
    { savedAt: envelope.savedAt, payload: compactPayload(envelope.payload, true) },
    { savedAt: envelope.savedAt, payload: compactPayload(envelope.payload, false) },
  ];
  for (const attempt of attempts) {
    const raw = JSON.stringify(attempt);
    if (trySetItem(storage, storageKey, raw)) {
      return;
    }
    pruneSnapshotKeys(storage, storageKey);
    if (trySetItem(storage, storageKey, raw)) {
      return;
    }
  }
}

/** Snapshot ainda válido, ou `undefined` se expirou / nunca existiu. */
export function readZabbixSnapshot(key: string, now: number = Date.now()): ZabbixSnapshotPayload | undefined {
  const mem = memory.get(key);
  if (mem && isFresh(mem.savedAt, now)) {
    return mem.payload;
  }
  if (mem) {
    memory.delete(key);
  }
  const stored = readStorage(key, now);
  if (stored) {
    memory.set(key, { savedAt: now, payload: stored });
  }
  return stored;
}

/** Grava um snapshot completo. Sem hosts não persiste — não vale pintar um mapa vazio. */
export function writeZabbixSnapshot(key: string, payload: ZabbixSnapshotPayload, now: number = Date.now()): void {
  if (!payload.hosts.length || !payload.statusItems.length) {
    return;
  }
  const envelope: StoredEnvelope = { savedAt: now, payload };
  memory.set(key, envelope);
  writeStorage(key, envelope);
}

/** Esquece a memória; o localStorage permanece — simula o reload do plugin no Grafana. */
export function dropZabbixSnapshotMemory(): void {
  memory.clear();
}

/** Testes e troca de datasource — descarta memória e as chaves deste prefixo. */
export function clearZabbixSnapshotCache(): void {
  dropZabbixSnapshotMemory();
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  try {
    pruneSnapshotKeys(storage);
  } catch {
    /* ignore */
  }
}
