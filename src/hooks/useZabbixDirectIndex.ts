import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZABBIX_DIRECT_DEFAULT_REFRESH_SEC, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import { fetchBackendPoll, fetchLiveSnapshot, type BackendLiveSnapshot } from '../services/pluginBackend';
import {
  isNumericZabbixItemId,
  ZabbixDirectMetadata,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
} from '../utils/zabbixApi';
import { coalesceLinkTraffic } from '../utils/linkMetricsRuntime';
import { HostProblemsMap } from '../utils/noc/types';

/**
 * Status e tráfego vêm do backend Go. Na abertura lê o snapshot em cache (`POST /snapshot`);
 * o Zabbix só entra no `POST /poll` quando o intervalo vence.
 */

const EMPTY_INDEX = buildQueryIndex(undefined);

const GENERIC_ERROR = 'Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados.';
const NO_GROUPS_ERROR = 'Nenhum dos grupos configurados existe no Zabbix.';
const NO_STATUS_ITEMS_ERROR =
  'Nenhum host dos grupos respondeu com o item de status. Confira o nome do item em "Item de status".';

export interface UseZabbixDirectIndexOptions {
  enabled: boolean;
  datasourceUid?: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  trafficItemIds?: string[];
  trafficKeys?: string[];
}

export interface UseZabbixDirectIndexResult {
  index: QueryIndex;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
}

interface DirectState {
  index: QueryIndex;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
}

const EMPTY_LAST_VALUES: Record<string, ZabbixItemLastValue> = {};
const EMPTY_INTERFACE_ITEMS: ZabbixInterfaceItem[] = [];
const EMPTY_PROBLEMS: HostProblemsMap = {};
const IDLE_STATE: DirectState = {
  index: EMPTY_INDEX,
  lastValues: EMPTY_LAST_VALUES,
  interfaceItems: EMPTY_INTERFACE_ITEMS,
  problems: EMPTY_PROBLEMS,
  ready: false,
  loading: false,
};

function applyLastValuesToStatusItems(
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

function statusLastValuesPresent(
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

function directStateFromBackendSnapshot(
  remote: BackendLiveSnapshot,
  datasourceUid: string,
  groupNames: string[],
  statusItemKey: string
): DirectState | undefined {
  if (!remote.metadata.resolvedGroups?.length) {
    return undefined;
  }
  if (remote.metadata.hosts.length && !remote.knownStatusItems.length) {
    return undefined;
  }
  const traffic = coalesceLinkTraffic(
    {
      lastValues: remote.lastValues ?? EMPTY_LAST_VALUES,
      interfaceItems: remote.interfaceItems ?? EMPTY_INTERFACE_ITEMS,
    },
    { lastValues: EMPTY_LAST_VALUES, interfaceItems: EMPTY_INTERFACE_ITEMS }
  );
  const statusItems = applyLastValuesToStatusItems(
    remote.knownStatusItems,
    traffic.lastValues,
    traffic.interfaceItems
  );
  if (remote.metadata.hosts.length && !statusLastValuesPresent(traffic.lastValues, statusItems)) {
    return undefined;
  }
  return {
    index: buildZabbixDirectIndex({
      datasourceUid,
      groupNames,
      statusItemKey,
      hosts: remote.metadata.hosts,
      statusItems,
    }),
    lastValues: traffic.lastValues,
    interfaceItems: traffic.interfaceItems,
    problems: remote.problems ?? EMPTY_PROBLEMS,
    ready: true,
    loading: false,
    error: undefined,
  };
}

interface LiveSession {
  state: DirectState;
  metadata: ZabbixDirectMetadata;
}

const liveSessionByKey = new Map<string, LiveSession>();

/** Testes: simula F5 (some o estado em memória desta aba). */
export function dropZabbixLiveIndex(): void {
  liveSessionByKey.clear();
}

function mapPollError(message: string | undefined): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes('grupos configurados')) {
    return NO_GROUPS_ERROR;
  }
  if (trimmed.includes('item de status')) {
    return NO_STATUS_ITEMS_ERROR;
  }
  if (trimmed.includes('sessão') || trimmed.includes('401')) {
    return 'Grafana recusou a sessão ao consultar o Zabbix. Recarregue o dashboard.';
  }
  return GENERIC_ERROR;
}

export function useZabbixDirectIndex({
  enabled,
  datasourceUid,
  groupNames,
  statusItemKey,
  refreshSec,
  trafficItemIds,
  trafficKeys,
}: UseZabbixDirectIndexOptions): UseZabbixDirectIndexResult {
  const groups = useMemo(
    () => [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))],
    [groupNames]
  );
  const itemKey = statusItemKey.trim();
  const parsedRefresh = Math.floor(Number(refreshSec));
  const intervalSec = Math.max(
    ZABBIX_DIRECT_MIN_REFRESH_SEC,
    Number.isFinite(parsedRefresh) ? parsedRefresh : ZABBIX_DIRECT_DEFAULT_REFRESH_SEC
  );
  const trafficIds = useMemo(
    () => [...new Set((trafficItemIds ?? []).map((id) => id.trim()).filter(Boolean))].sort(),
    [trafficItemIds]
  );
  const trafficItemKeys = useMemo(
    () => [...new Set((trafficKeys ?? []).map((key) => key.trim()).filter(Boolean))].sort(),
    [trafficKeys]
  );
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}`;
  const snapshotKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}`;

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const trafficItemIdsRef = useRef(trafficIds);
  trafficItemIdsRef.current = trafficIds;
  const trafficKeysRef = useRef(trafficItemKeys);
  trafficKeysRef.current = trafficItemKeys;
  const prevConfigKeyRef = useRef<string | null>(null);

  const [state, setState] = useState<DirectState>(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      return IDLE_STATE;
    }
    const live = liveSessionByKey.get(snapshotKey)?.state;
    if (live) {
      return live;
    }
    return { ...IDLE_STATE, loading: true };
  });

  useLayoutEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      setState(IDLE_STATE);
      return;
    }

    const live = liveSessionByKey.get(snapshotKey);
    const configChanged = prevConfigKeyRef.current !== null && prevConfigKeyRef.current !== configKey;
    prevConfigKeyRef.current = configKey;
    setState((prev) => {
      if (live) {
        return { ...live.state, loading: false };
      }
      if (prev.ready && configChanged) {
        return { ...prev, loading: true };
      }
      if (prev.ready) {
        return { ...prev, loading: false };
      }
      return prev.loading ? prev : { ...prev, loading: true };
    });

    let cancelled = false;
    let intervalId: number | undefined;

    const applySnapshot = (snapshot: BackendLiveSnapshot, ready: boolean, loading: boolean, error?: string) => {
      const fromSnapshot = directStateFromBackendSnapshot(
        snapshot,
        datasourceUid,
        groupsRef.current,
        itemKey
      );
      if (fromSnapshot && ready && !error) {
        liveSessionByKey.set(snapshotKey, {
          state: fromSnapshot,
          metadata: snapshot.metadata,
        });
        setState(fromSnapshot);
        return true;
      }
      if (error) {
        setState({
          index: EMPTY_INDEX,
          lastValues: EMPTY_LAST_VALUES,
          interfaceItems: EMPTY_INTERFACE_ITEMS,
          problems: EMPTY_PROBLEMS,
          ready: false,
          loading,
          error: mapPollError(error),
        });
        return false;
      }
      if (fromSnapshot) {
        setState({ ...fromSnapshot, ready, loading });
        return ready;
      }
      setState((prev) => ({
        ...prev,
        ready,
        loading,
        error: ready ? undefined : prev.error,
      }));
      return ready;
    };

    const runPoll = async () => {
      const response = await fetchBackendPoll({
        datasourceUid,
        groupNames: groupsRef.current,
        statusItemKey: itemKey,
        trafficItemIds: trafficItemIdsRef.current,
        trafficKeys: trafficKeysRef.current,
        refreshSec: intervalSec,
      });
      if (cancelled || !response) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: prev.error ?? GENERIC_ERROR,
          }));
        }
        return;
      }
      applySnapshot(response.snapshot, response.ready, false, response.error);
    };

    void (async () => {
      if (live?.state.ready) {
        intervalId = window.setInterval(() => void runPoll(), intervalSec * 1000);
        return;
      }
      const cached = await fetchLiveSnapshot(snapshotKey);
      if (cancelled) {
        return;
      }
      if (cached && applySnapshot(cached, true, false)) {
        intervalId = window.setInterval(() => void runPoll(), intervalSec * 1000);
        return;
      }
      setState((prev) => ({ ...prev, loading: true }));
      await runPoll();
      if (!cancelled) {
        intervalId = window.setInterval(() => void runPoll(), intervalSec * 1000);
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, configKey, datasourceUid, itemKey, snapshotKey, intervalSec]);

  return state;
}
