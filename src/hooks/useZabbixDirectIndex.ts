import { startTransition, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZABBIX_DIRECT_DEFAULT_REFRESH_SEC, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
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
import { ZabbixInterfaceItem, ZabbixItemLastValue, ZabbixLiveSnapshot } from '../utils/zabbixApi';
import { coalesceLinkTraffic } from '../utils/linkMetricsRuntime';
import { HostProblemsMap } from '../utils/noc/types';

/**
 * Consulta o Zabbix no browser. O backend Go só valida a licença.
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

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const trafficItemIdsRef = useRef(trafficIds);
  trafficItemIdsRef.current = trafficIds;
  const trafficKeysRef = useRef(trafficItemKeys);
  trafficKeysRef.current = trafficItemKeys;
  const previousRef = useRef<ZabbixLiveSnapshot | undefined>(undefined);
  const lastReadyRef = useRef<DirectState | undefined>(undefined);
  const prevConfigKeyRef = useRef<string | null>(null);

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
      setState(IDLE_STATE);
      return;
    }

    const configChanged = prevConfigKeyRef.current !== null && prevConfigKeyRef.current !== configKey;
    prevConfigKeyRef.current = configKey;
    if (configChanged) {
      previousRef.current = undefined;
      lastReadyRef.current = undefined;
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

    const applySnapshot = (snapshot: ZabbixLiveSnapshot, ready: boolean, loading: boolean, error?: string) => {
      const fromSnapshot = directStateFromLiveSnapshot(
        snapshot,
        datasourceUid,
        groupsRef.current,
        itemKey,
        lastReadyRef.current,
        previousRef.current
      );
      if (fromSnapshot && ready && !error) {
        previousRef.current = snapshot;
        const alreadyReady = Boolean(lastReadyRef.current?.ready);
        lastReadyRef.current = fromSnapshot;
        if (alreadyReady) {
          startTransition(() => setState(fromSnapshot));
        } else {
          setState(fromSnapshot);
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
      if (fromSnapshot) {
        previousRef.current = snapshot;
        setState({ ...fromSnapshot, ready, loading });
        return;
      }
      setState((prev) => ({
        ...prev,
        loading,
        error: ready ? undefined : prev.error,
      }));
    };

    const runPoll = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
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
  }, [enabled, configKey, datasourceUid, itemKey, intervalSec]);

  return state;
}
