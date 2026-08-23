import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import {
  fetchZabbixDirectMetadata,
  fetchZabbixStatusItems,
  isBenignZabbixFetchError,
  ZabbixDirectMetadata,
} from '../utils/zabbixApi';
import {
  POLL_WATCHDOG_MS,
  canStartPolledFetch,
  canStartRefreshEventFetch,
} from '../utils/pollingGate';

/**
 * Busca periódica do último valor no Zabbix.
 *
 * O painel não usa a aba Query, então o polling vive aqui. Ele para quando a aba está oculta,
 * não sobrepõe buscas rápidas e retoma o ciclo se a busca anterior não voltou (watchdog) —
 * senão o mapa fica preso no primeiro snapshot.
 *
 * Sem cache nem publicação intermediária: `ready` só sobe após a resposta completa do status.
 *
 * O ciclo periódico é uma única `item.get`. A identidade dos hosts (nome, IP, grupos, tags) é
 * buscada uma vez por configuração, porque não decide online/offline — só o status é refeito.
 */

const EMPTY_INDEX = buildQueryIndex(undefined);

const GENERIC_ERROR = 'Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados.';
const NO_GROUPS_ERROR = 'Nenhum dos grupos configurados existe no Zabbix.';
const NO_STATUS_ITEMS_ERROR =
  'Nenhum host dos grupos respondeu com o item de status. Confira a chave em "Item de status".';

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

  const [state, setState] = useState<DirectState>(() =>
    !enabled || !datasourceUid || !groups.length || !itemKey
      ? IDLE_STATE
      : { ...IDLE_STATE, loading: true }
  );

  useLayoutEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      setState(IDLE_STATE);
      return;
    }

    setState({ ...IDLE_STATE, loading: true });

    let cancelled = false;
    let inFlight = false;
    let lastStartMs = 0;
    let fetchGeneration = 0;
    /**
     * Só descarta resultado mais antigo do que o já publicado. Comparar com a geração em voo
     * fazia um snapshot lento ser jogado fora toda vez que o watchdog liberava outro ciclo — o
     * mapa nunca recebia status e ficava cinza indefinidamente.
     */
    let lastPublishedGeneration = 0;
    /** Timeout/abort isolado só vira erro visível na segunda falha seguida. */
    let consecutiveFailures = 0;
    /** Identidade dos hosts desta configuração; refeita só se a busca anterior falhou. */
    let metadata: ZabbixDirectMetadata | undefined;
    /** Cancela a busca anterior quando o watchdog ou o timer disparam outro ciclo. */
    let fetchAbort: AbortController | undefined;

    const ensureMetadata = async (abortSignal: AbortSignal): Promise<ZabbixDirectMetadata> => {
      if (!metadata) {
        metadata = await fetchZabbixDirectMetadata(datasourceUid, groupsRef.current, abortSignal);
      }
      return metadata;
    };

    const fetchSnapshot = async (source: 'poll' | 'refreshEvent' = 'poll') => {
      if (cancelled) {
        return;
      }
      if (document.hidden && !inFlight && Date.now() - lastStartMs < POLL_WATCHDOG_MS) {
        return;
      }
      const allowed =
        source === 'refreshEvent'
          ? canStartRefreshEventFetch(Date.now(), lastStartMs, inFlight, intervalSec * 1000)
          : canStartPolledFetch(Date.now(), lastStartMs, inFlight);
      if (!allowed) {
        return;
      }
      lastStartMs = Date.now();
      const generation = ++fetchGeneration;
      fetchAbort?.abort();
      fetchAbort = new AbortController();
      const abortSignal = fetchAbort.signal;
      inFlight = true;
      try {
        const meta = await ensureMetadata(abortSignal);
        const statusItems = meta.groupIds.length
          ? await fetchZabbixStatusItems(datasourceUid, meta.groupIds, itemKey, abortSignal)
          : [];
        if (cancelled || generation <= lastPublishedGeneration) {
          return;
        }
        lastPublishedGeneration = generation;
        if (!meta.resolvedGroups.length) {
          setState({ index: EMPTY_INDEX, ready: false, loading: false, error: NO_GROUPS_ERROR });
          return;
        }
        if (meta.hosts.length && !statusItems.length) {
          setState({ index: EMPTY_INDEX, ready: false, loading: false, error: NO_STATUS_ITEMS_ERROR });
          return;
        }

        const index = buildZabbixDirectIndex({
          datasourceUid,
          groupNames: groupsRef.current,
          statusItemKey: itemKey,
          hosts: meta.hosts,
          statusItems,
        });
        consecutiveFailures = 0;
        setState({
          index,
          ready: true,
          loading: false,
          error: undefined,
        });
      } catch (err) {
        if (abortSignal.aborted && !cancelled) {
          return;
        }
        consecutiveFailures += 1;
        if (!cancelled && generation > lastPublishedGeneration) {
          lastPublishedGeneration = generation;
          const retrying = isBenignZabbixFetchError(err) && consecutiveFailures < 2;
          setState({
            index: EMPTY_INDEX,
            ready: false,
            // Sem isto o painel ficava sem badge nenhum: mapa cinza e nenhuma pista do motivo.
            loading: retrying,
            error: retrying ? undefined : GENERIC_ERROR,
          });
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
        // Reabrir a aba é a janela natural para reler a identidade dos hosts e pegar host novo.
        metadata = undefined;
        void fetchSnapshot();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const refreshSub = eventBus
      ?.getStream(RefreshEvent)
      .subscribe(() => void fetchSnapshot('refreshEvent'));

    return () => {
      cancelled = true;
      fetchAbort?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      refreshSub?.unsubscribe();
    };
    // `configKey` resume datasource, grupos, chave e intervalo num único valor estável.
  }, [enabled, configKey, eventBus, datasourceUid, itemKey]);

  return state;
}
