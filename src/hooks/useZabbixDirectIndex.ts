import { useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import { fetchZabbixDirectSnapshot, isBenignZabbixFetchError } from '../utils/zabbixApi';
import { clearHostDisplayOverlay } from '../utils/hostDisplayOverlay';

/**
 * Busca periódica do último valor no Zabbix, para o modo "Zabbix direto".
 *
 * O painel não usa a aba Query nesse modo, então nada dispara o ciclo de refresh do Grafana: o
 * polling vive aqui. Ele para quando a aba está oculta, nunca deixa duas buscas simultâneas e
 * respeita um intervalo mínimo entre chamadas, para não martelar o servidor Zabbix quando o
 * dashboard fica muito tempo aberto.
 */

/** Intervalo mínimo entre duas buscas, independente do que dispare o ciclo. */
const MIN_FETCH_GAP_MS = 2_000;

const EMPTY_INDEX = buildQueryIndex(undefined);

const GENERIC_ERROR = 'Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados.';
const NO_GROUPS_ERROR = 'Nenhum dos grupos configurados existe no Zabbix.';

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

  const [state, setState] = useState<DirectState>(IDLE_STATE);

  useEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      setState(IDLE_STATE);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let lastStartMs = 0;
    setState((prev) => ({ ...prev, loading: true }));

    const fetchSnapshot = async () => {
      if (cancelled || inFlight || document.hidden || Date.now() - lastStartMs < MIN_FETCH_GAP_MS) {
        return;
      }
      lastStartMs = Date.now();
      inFlight = true;
      try {
        const snapshot = await fetchZabbixDirectSnapshot(datasourceUid, groupsRef.current, itemKey);
        if (cancelled) {
          return;
        }
        if (!snapshot.resolvedGroups.length) {
          setState({ index: EMPTY_INDEX, ready: false, loading: false, error: NO_GROUPS_ERROR });
          return;
        }
        clearHostDisplayOverlay();
        setState({
          index: buildZabbixDirectIndex({
            datasourceUid,
            groupNames: groupsRef.current,
            statusItemKey: itemKey,
            hosts: snapshot.hosts,
            statusItems: snapshot.statusItems,
          }),
          ready: true,
          loading: false,
          error: undefined,
        });
      } catch (err) {
        if (!cancelled) {
          if (isBenignZabbixFetchError(err)) {
            setState((prev) => ({ ...prev, loading: false }));
          } else {
            setState((prev) => ({ ...prev, loading: false, error: GENERIC_ERROR }));
          }
        }
      } finally {
        inFlight = false;
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
