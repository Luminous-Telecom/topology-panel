import { MutableRefObject, startTransition, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TopologyStatusValueMapping, ZABBIX_DIRECT_DEFAULT_REFRESH_SEC, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { applyStatusValuesToIndex, buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import {
  applyLastValuesToStatusItems,
  runZabbixPoll,
  statusLastValuesPresent,
  ZABBIX_GENERIC_ERROR,
  ZABBIX_NO_GROUPS_ERROR,
  ZABBIX_NO_STATUS_ITEMS_ERROR,
} from '../services/zabbixPoll';
import {
  buildZabbixBackendStatusRequest,
  fetchZabbixBackendStatus,
  hostsFromBackendRows,
  httpStatusFromError,
  statusItemsFromBackendRows,
  type ZabbixBackendPollLayout,
  type ZabbixBackendStatusResponse,
} from '../services/zabbixBackendStatus';
import { ZabbixDirectHost, ZabbixInterfaceItem, ZabbixItemLastValue, ZabbixLiveSnapshot } from '../utils/zabbixApi';
import { coalesceLinkTraffic } from '../utils/linkMetricsRuntime';
import { HostProblemsMap } from '../utils/noc/types';
import { RegionHostStats, regionStatsFromBackend } from '../utils/networkStats';
import { structuralShareMap } from '../utils/structuralIdentity';

/**
 * Consulta o Zabbix no browser, ou no backend Go quando `pollViaBackend` está ligado.
 */

const EMPTY_INDEX = buildQueryIndex(undefined);

export interface UseZabbixDirectIndexOptions {
  enabled: boolean;
  datasourceUid?: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  trafficItemIds?: string[];
  trafficKeys?: string[];
  pollViaBackend?: boolean;
  statusValueMappings?: TopologyStatusValueMapping[];
  layoutRef?: MutableRefObject<ZabbixBackendPollLayout | undefined>;
  regionLayoutKey?: string;
}

export interface UseZabbixDirectIndexResult {
  index: QueryIndex;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
  regionStats?: Map<string, RegionHostStats>;
}

interface DirectState {
  index: QueryIndex;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
  regionStats?: Map<string, RegionHostStats>;
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

function reuseHostList(previous: ZabbixDirectHost[] | undefined, next: ZabbixDirectHost[]): ZabbixDirectHost[] {
  if (!previous || previous.length !== next.length) {
    return next;
  }
  for (let i = 0; i < previous.length; i += 1) {
    const prev = previous[i];
    const host = next[i];
    if (prev.hostid !== host.hostid || prev.host !== host.host || prev.name !== host.name) {
      return next;
    }
  }
  return previous;
}

function snapshotFromBackendPayload(
  payload: ZabbixBackendStatusResponse,
  groupNames: string[],
  statusItemKey: string,
  previous?: ZabbixLiveSnapshot
): ZabbixLiveSnapshot {
  const hosts = reuseHostList(previous?.metadata.hosts, hostsFromBackendRows(payload.hosts ?? []));
  return {
    savedAt: payload.savedAt,
    metadata: {
      hosts,
      resolvedGroups: previous?.metadata.resolvedGroups.length ? previous.metadata.resolvedGroups : groupNames,
      groupIds: previous?.metadata.groupIds ?? [],
    },
    knownStatusItems: statusItemsFromBackendRows(payload.hosts ?? [], statusItemKey),
    lastValues: payload.lastValues ?? EMPTY_LAST_VALUES,
    interfaceItems: payload.interfaceItems ?? EMPTY_INTERFACE_ITEMS,
    problems: payload.problems ?? EMPTY_PROBLEMS,
  };
}

function withRegionStats(
  state: DirectState,
  rows: ZabbixBackendStatusResponse['regionStats'] | undefined
): DirectState {
  const next = regionStatsFromBackend(rows);
  return {
    ...state,
    regionStats: structuralShareMap(next, state.regionStats),
  };
}

function directStateFromLiveSnapshot(
  remote: ZabbixLiveSnapshot,
  datasourceUid: string,
  groupNames: string[],
  statusItemKey: string,
  previousReady?: DirectState,
  previousSnapshot?: ZabbixLiveSnapshot
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
  const canPatch =
    Boolean(previousReady?.ready) &&
    previousSnapshot !== undefined &&
    previousSnapshot.metadata.hosts === remote.metadata.hosts;
  let index: QueryIndex;
  if (canPatch && previousReady) {
    index = applyStatusValuesToIndex(
      previousReady.index,
      remote.metadata.hosts,
      statusItems,
      statusItemKey
    ).index;
  } else {
    index = buildZabbixDirectIndex({
      datasourceUid,
      groupNames,
      statusItemKey,
      hosts: remote.metadata.hosts,
      statusItems,
    });
  }
  return {
    index,
    lastValues: traffic.lastValues,
    interfaceItems: traffic.interfaceItems,
    problems: remote.problems ?? EMPTY_PROBLEMS,
    ready: true,
    loading: false,
    error: undefined,
    regionStats: previousReady?.regionStats,
  };
}

function mapPollError(message: string | undefined): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === ZABBIX_NO_GROUPS_ERROR || trimmed === ZABBIX_NO_STATUS_ITEMS_ERROR) {
    return trimmed;
  }
  if (trimmed.includes('sessão')) {
    return 'Grafana recusou a sessão ao consultar o Zabbix. Recarregue o dashboard.';
  }
  return ZABBIX_GENERIC_ERROR;
}

export function useZabbixDirectIndex({
  enabled,
  datasourceUid,
  groupNames,
  statusItemKey,
  refreshSec,
  trafficItemIds,
  trafficKeys,
  pollViaBackend = false,
  statusValueMappings,
  layoutRef,
  regionLayoutKey = '',
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
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}\u0000${pollViaBackend ? '1' : '0'}`;

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const trafficItemIdsRef = useRef(trafficIds);
  trafficItemIdsRef.current = trafficIds;
  const trafficKeysRef = useRef(trafficItemKeys);
  trafficKeysRef.current = trafficItemKeys;
  const mappingsRef = useRef(statusValueMappings);
  mappingsRef.current = statusValueMappings;
  const pollViaBackendRef = useRef(pollViaBackend);
  pollViaBackendRef.current = pollViaBackend;
  const layoutRefInternal = useRef(layoutRef);
  layoutRefInternal.current = layoutRef;
  const previousRef = useRef<ZabbixLiveSnapshot | undefined>(undefined);
  const lastReadyRef = useRef<DirectState | undefined>(undefined);
  const prevConfigKeyRef = useRef<string | null>(null);
  const browserFallbackRef = useRef(false);

  const [state, setState] = useState<DirectState>(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      return IDLE_STATE;
    }
    return { ...IDLE_STATE, loading: true };
  });

  useLayoutEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      previousRef.current = undefined;
      lastReadyRef.current = undefined;
      browserFallbackRef.current = false;
      setState(IDLE_STATE);
      return;
    }

    const configChanged = prevConfigKeyRef.current !== null && prevConfigKeyRef.current !== configKey;
    prevConfigKeyRef.current = configKey;
    if (configChanged) {
      previousRef.current = undefined;
      lastReadyRef.current = undefined;
      browserFallbackRef.current = false;
    }
    setState((prev) => {
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
    let inFlight = false;

    const applySnapshot = (
      snapshot: ZabbixLiveSnapshot,
      ready: boolean,
      loading: boolean,
      error?: string,
      regionRows?: ZabbixBackendStatusResponse['regionStats']
    ) => {
      const fromSnapshot = directStateFromLiveSnapshot(
        snapshot,
        datasourceUid,
        groupsRef.current,
        itemKey,
        lastReadyRef.current,
        previousRef.current
      );
      const withStats =
        fromSnapshot && regionRows
          ? withRegionStats(fromSnapshot, regionRows)
          : fromSnapshot;
      if (withStats && ready && !error) {
        previousRef.current = snapshot;
        const alreadyReady = Boolean(lastReadyRef.current?.ready);
        lastReadyRef.current = withStats;
        if (alreadyReady) {
          startTransition(() => setState(withStats));
        } else {
          setState(withStats);
        }
        return;
      }
      if (error) {
        setState((prev) => {
          if (prev.ready) {
            return { ...prev, loading: false, error: mapPollError(error) };
          }
          return {
            index: EMPTY_INDEX,
            lastValues: EMPTY_LAST_VALUES,
            interfaceItems: EMPTY_INTERFACE_ITEMS,
            problems: EMPTY_PROBLEMS,
            ready: false,
            loading,
            error: mapPollError(error),
          };
        });
        return;
      }
      if (withStats) {
        previousRef.current = snapshot;
        setState({ ...withStats, ready, loading });
        return;
      }
      setState((prev) => ({
        ...prev,
        loading,
        error: ready ? undefined : prev.error,
      }));
    };

    const runBrowserPoll = async () => {
      const result = await runZabbixPoll({
        datasourceUid,
        groupNames: groupsRef.current,
        statusItemKey: itemKey,
        trafficItemIds: trafficItemIdsRef.current,
        trafficKeys: trafficKeysRef.current,
        previous: previousRef.current,
        onSnapshot: (snapshot) => {
          if (!cancelled) {
            applySnapshot(snapshot, true, false);
          }
        },
      });
      if (cancelled) {
        return;
      }
      applySnapshot(result.snapshot, !result.error, false, result.error);
    };

    const runBackendPoll = async (): Promise<boolean> => {
      const request = buildZabbixBackendStatusRequest({
        datasourceUid,
        groupNames: groupsRef.current,
        statusItemKey: itemKey,
        refreshSec: intervalSec,
        trafficItemIds: trafficItemIdsRef.current,
        trafficKeys: trafficKeysRef.current,
        statusValueMappings: mappingsRef.current ?? [],
        layout: layoutRefInternal.current?.current,
      });
      try {
        const payload = await fetchZabbixBackendStatus(request);
        if (cancelled) {
          return true;
        }
        const snapshot = snapshotFromBackendPayload(
          payload,
          groupsRef.current,
          itemKey,
          previousRef.current
        );
        applySnapshot(snapshot, !payload.error, false, payload.error, payload.regionStats);
        return true;
      } catch (err) {
        if (cancelled) {
          return true;
        }
        if (httpStatusFromError(err) === 404) {
          browserFallbackRef.current = true;
          return false;
        }
        applySnapshot(
          previousRef.current ?? {
            savedAt: Date.now(),
            metadata: { hosts: [], resolvedGroups: [], groupIds: [] },
            knownStatusItems: [],
            lastValues: EMPTY_LAST_VALUES,
            interfaceItems: EMPTY_INTERFACE_ITEMS,
            problems: EMPTY_PROBLEMS,
          },
          Boolean(previousRef.current),
          false,
          (err as { message?: string })?.message ?? ZABBIX_GENERIC_ERROR
        );
        return true;
      }
    };

    const runPoll = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const useBackend = pollViaBackendRef.current && !browserFallbackRef.current;
        if (useBackend) {
          const handled = await runBackendPoll();
          if (!handled && !cancelled) {
            await runBrowserPoll();
          }
          return;
        }
        await runBrowserPoll();
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: prev.error ?? ZABBIX_GENERIC_ERROR,
          }));
        }
      } finally {
        inFlight = false;
      }
    };

    void (async () => {
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
  }, [enabled, configKey, datasourceUid, itemKey, intervalSec, regionLayoutKey]);

  return state;
}
