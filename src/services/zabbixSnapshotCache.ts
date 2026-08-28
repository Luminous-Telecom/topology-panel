import { HostHoverSeriesMap } from '../utils/hostTimeSeries';
import { HostProblemsMap } from '../utils/noc/types';
import { ZabbixDirectHost, ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';

/**
 * Último snapshot completo (status + tráfego) para pintar o mapa ao abrir o dashboard
 * sem esperar o Zabbix. Memória cobre remontagem do painel; localStorage cobre F5 / nova aba
 * na mesma origem, com TTL curto.
 */

export const ZABBIX_SNAPSHOT_TTL_MS = 30 * 60_000;
const STORAGE_PREFIX = 'luminous-topology.zabbixSnapshot.v1:';

export interface ZabbixSnapshotPayload {
  datasourceUid: string;
  groupNames: string[];
  statusItemKey: string;
  hosts: ZabbixDirectHost[];
  statusItems: ZabbixInterfaceItem[];
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  hoverByHost?: HostHoverSeriesMap;
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

function isFresh(savedAt: number, now: number): boolean {
  return now - savedAt < ZABBIX_SNAPSHOT_TTL_MS;
}

function readStorage(key: string, now: number): ZabbixSnapshotPayload | undefined {
  if (typeof localStorage === 'undefined') {
    return undefined;
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) {
      return undefined;
    }
    const envelope = JSON.parse(raw) as StoredEnvelope;
    if (!envelope?.payload?.hosts?.length || !isFresh(envelope.savedAt, now)) {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return undefined;
    }
    return envelope.payload;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, envelope: StoredEnvelope): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    const { hoverByHost: _hover, ...persisted } = envelope.payload;
    localStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ savedAt: envelope.savedAt, payload: persisted })
    );
  } catch {
    /* quota / modo privado — a memória do módulo ainda cobre a sessão */
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
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
