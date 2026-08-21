import { useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import { fetchZabbixDirectSnapshot, isBenignZabbixFetchError } from '../utils/zabbixApi';
import { POLL_WATCHDOG_MS, canStartPolledFetch } from '../utils/pollingGate';

/**
 * Busca periódica do último valor no Zabbix.
 *
 * O painel não usa a aba Query, então o polling vive aqui. Ele para quando a aba está oculta,
 * não sobrepõe buscas rápidas e retoma o ciclo se a busca anterior não voltou (watchdog) —
 * senão o mapa fica preso no primeiro snapshot.
 */

const EMPTY_INDEX = buildQueryIndex(undefined);

const GENERIC_ERROR = 'Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados.';
const NO_GROUPS_ERROR = 'Nenhum dos grupos configurados existe no Zabbix.';

/** Último índice bom por datasource+grupos+item — sobrevive a remount do painel na mesma sessão. */
const lastGoodIndexByKey = new Map<string, QueryIndex>();

function snapshotCacheKey(datasourceUid: string, groups: string[], itemKey: string): string {
  return `${datasourceUid}\u0000${groups.join('\u0001')}\u0000${itemKey}`;
}

export interface UseZabbixDirectIndexOptions {
  enabled: boolean;
  datasourceUid?: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  eventBus?: EventBus;
}

export interface UseZabbixDirectIndexResult {
  index: QueryIndex;
  /** Já houve ao menos uma resposta boa para a configuração atual. */
  ready: boolean;
  loading: boolean;
  error?: string;
}

interface DirectState {
  index: QueryIndex;
  ready: boolean;
  loading: boolean;
  error?: string;
}

const IDLE_STATE: DirectState = { index: EMPTY_INDEX, ready: false, loading: false };

export function useZabbixDirectIndex({
  enabled,
  datasourceUid,
  groupNames,
  statusItemKey,
  refreshSec,
  eventBus,
}: UseZabbixDirectIndexOptions): UseZabbixDirectIndexResult {
  const groups = useMemo(
    () => [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))],
    [groupNames]
  );
  const itemKey = statusItemKey.trim();
  const intervalSec = Math.max(ZABBIX_DIRECT_MIN_REFRESH_SEC, Math.floor(refreshSec));
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}`;

  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const [state, setState] = useState<DirectState>(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      return IDLE_STATE;
    }
    const cached = lastGoodIndexByKey.get(snapshotCacheKey(datasourceUid, groups, itemKey));
    return cached
      ? { index: cached, ready: true, loading: false, error: undefined }
      : IDLE_STATE;
  });

  useEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      setState(IDLE_STATE);
      return;
    }

    const cacheKey = snapshotCacheKey(datasourceUid, groups, itemKey);
    const cached = lastGoodIndexByKey.get(cacheKey);
    setState(
      cached
        ? { index: cached, ready: true, loading: true, error: undefined }
        : { ...IDLE_STATE, loading: true }
    );

    let cancelled = false;
    let inFlight = false;
    let lastStartMs = 0;
    let fetchGeneration = 0;

    const fetchSnapshot = async () => {
      if (cancelled) {
        return;
      }
      if (document.hidden && !inFlight && Date.now() - lastStartMs < POLL_WATCHDOG_MS) {
        return;
      }
      if (!canStartPolledFetch(Date.now(), lastStartMs, inFlight)) {
        return;
      }
      lastStartMs = Date.now();
      const generation = ++fetchGeneration;
      inFlight = true;
      try {
        const snapshot = await fetchZabbixDirectSnapshot(datasourceUid, groupsRef.current, itemKey);
        if (cancelled || generation !== fetchGeneration) {
          return;
        }
        if (!snapshot.resolvedGroups.length) {
          setState({ index: EMPTY_INDEX, ready: false, loading: false, error: NO_GROUPS_ERROR });
          return;
        }
        const index = buildZabbixDirectIndex({
          datasourceUid,
          groupNames: groupsRef.current,
          statusItemKey: itemKey,
          hosts: snapshot.hosts,
          statusItems: snapshot.statusItems,
        });
        lastGoodIndexByKey.set(cacheKey, index);
        setState({
          index,
          ready: true,
          loading: false,
          error: undefined,
        });
      } catch (err) {
        if (!cancelled && generation === fetchGeneration) {
          if (isBenignZabbixFetchError(err)) {
            setState((prev) => ({ ...prev, loading: false }));
          } else {
            setState((prev) => ({ ...prev, loading: false, error: GENERIC_ERROR }));
          }
        }
      } finally {
        if (generation === fetchGeneration) {
          inFlight = false;
        }
      }
    };

    void fetchSnapshot();

    const timer = window.setInterval(() => void fetchSnapshot(), intervalSec * 1000);
    const handleVisibility = () => {
      if (!document.hidden) {
        void fetchSnapshot();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const refreshSub = eventBus?.getStream(RefreshEvent).subscribe(() => void fetchSnapshot());

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      refreshSub?.unsubscribe();
    };
    // `configKey` resume datasource, grupos, chave e intervalo num único valor estável.
  }, [enabled, configKey, eventBus]);

  return state;
}
