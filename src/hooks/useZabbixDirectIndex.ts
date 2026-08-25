import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EventBus, TimeRange } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import {
  fetchZabbixDirectMetadata,
  isBenignZabbixFetchError,
  isNumericZabbixItemId,
  resolveZabbixItemIdsByKeys,
  ZabbixDirectMetadata,
  ZabbixItemLastValue,
} from '../utils/zabbixApi';
import { aliasLastValuesByItemKey } from '../utils/linkMetricsRuntime';
import {
  fetchZabbixStatusViaQuery,
  fetchZabbixTrafficLastValuesViaQuery,
} from '../utils/zabbixDatasourceQuery';
import { HostHoverSeriesMap } from '../utils/hostTimeSeries';
import { HostProblemsMap } from '../utils/noc/types';
import { POLL_WATCHDOG_MS, canStartRefreshEventFetch } from '../utils/pollingGate';
import { StatusColorOptions } from '../utils/statusMapping';

/**
 * Busca periódica do último valor no Zabbix.
 *
 * O painel não usa a aba Query, então o polling vive aqui. Ele para quando a aba está oculta,
 * não sobrepõe buscas rápidas e retoma o ciclo se a busca anterior não voltou (watchdog) —
 * senão o mapa fica preso no primeiro snapshot.
 *
 * A primeira publicação espera a resposta completa. Trocar grupos (abrir submapa, editar)
 * não zera o índice: o mapa continua com o último snapshot até o novo chegar.
 *
 * O ciclo periódico chama `ds.query()` do datasource Zabbix: um POST com Metrics (status/hover)
 * e Problems (Warning+) no mesmo request. O último ponto RX/TX dos cabos fica noutro
 * `ds.query()` Item ID — janela de 5 min, incompatível com o sparkline. Os dois rodam em
 * paralelo. Cabo só com `key` resolve o itemid em paralelo ao status.
 * A identidade dos hosts (IP, tags, descrição) continua em `host.get` uma vez:
 * o DataFrame não traz isso. O `RefreshEvent` do dashboard não recomeça este efeito — o Grafana
 * recria o EventBus no load e isso abortava o primeiro `ds.query()` para disparar outro.
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
  eventBus?: EventBus;
  timeRange?: TimeRange;
  statusOptions?: StatusColorOptions;
  /** Itemids de RX/TX dos cabos — último ponto da série em paralelo. */
  trafficItemIds?: string[];
  /** Chaves dos cabos sem itemid numérico — resolvidas uma vez via `item.get`. */
  trafficKeys?: string[];
}

export interface UseZabbixDirectIndexResult {
  index: QueryIndex;
  hoverByHost: HostHoverSeriesMap;
  lastValues: Record<string, ZabbixItemLastValue>;
  problems: HostProblemsMap;
  /** Já houve ao menos uma resposta boa para a configuração atual. */
  ready: boolean;
  loading: boolean;
  error?: string;
}

interface DirectState {
  index: QueryIndex;
  hoverByHost: HostHoverSeriesMap;
  lastValues: Record<string, ZabbixItemLastValue>;
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
}

const EMPTY_HOVER: HostHoverSeriesMap = {};
const EMPTY_LAST_VALUES: Record<string, ZabbixItemLastValue> = {};
const EMPTY_PROBLEMS: HostProblemsMap = {};
const IDLE_STATE: DirectState = {
  index: EMPTY_INDEX,
  hoverByHost: EMPTY_HOVER,
  lastValues: EMPTY_LAST_VALUES,
  problems: EMPTY_PROBLEMS,
  ready: false,
  loading: false,
};

export function useZabbixDirectIndex({
  enabled,
  datasourceUid,
  groupNames,
  statusItemKey,
  refreshSec,
  eventBus,
  timeRange,
  statusOptions,
  trafficItemIds,
  trafficKeys,
}: UseZabbixDirectIndexOptions): UseZabbixDirectIndexResult {
  const groups = useMemo(
    () => [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))],
    [groupNames]
  );
  const itemKey = statusItemKey.trim();
  const intervalSec = Math.max(ZABBIX_DIRECT_MIN_REFRESH_SEC, Math.floor(refreshSec));
  const trafficIds = useMemo(
    () => [...new Set((trafficItemIds ?? []).map((id) => id.trim()).filter(Boolean))].sort(),
    [trafficItemIds]
  );
  const trafficItemKeys = useMemo(
    () => [...new Set((trafficKeys ?? []).map((key) => key.trim()).filter(Boolean))].sort(),
    [trafficKeys]
  );
  /*
   * Os grupos da árvore não mudam ao abrir um submapa. Sem as chaves/ids do mapa visível aqui,
   * o efeito não recomeça e o tráfego do APD esperava o próximo ciclo (ou o watchdog).
   */
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}\u0000${trafficIds.join('\u0001')}\u0000${trafficItemKeys.join('\u0001')}`;

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;
  const statusOptionsRef = useRef(statusOptions);
  statusOptionsRef.current = statusOptions;
  const trafficItemIdsRef = useRef(trafficIds);
  trafficItemIdsRef.current = trafficIds;
  const trafficKeysRef = useRef(trafficItemKeys);
  trafficKeysRef.current = trafficItemKeys;
  /**
   * O Grafana recria o EventBus no carregamento do dashboard. Se o poll depende disso, o efeito
   * aborta o primeiro `ds.query()` e dispara outro — duas buscas iguais ao recarregar.
   */
  const fetchSnapshotRef = useRef<() => void>(() => undefined);

  const [state, setState] = useState<DirectState>(() =>
    !enabled || !datasourceUid || !groups.length || !itemKey
      ? IDLE_STATE
      : { ...IDLE_STATE, loading: true }
  );

  useLayoutEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      fetchSnapshotRef.current = () => undefined;
      setState(IDLE_STATE);
      return;
    }

    setState((prev) => ({
      index: prev.index,
      hoverByHost: prev.hoverByHost,
      lastValues: prev.lastValues,
      problems: prev.problems,
      ready: prev.ready,
      loading: true,
      error: prev.error,
    }));

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
    /** itemid numérico por key — só busca as chaves que ainda não resolveram. */
    let itemIdByKey = new Map<string, string>();
    /** Chaves já pedidas ao `item.get` nesta configuração — não repete as que não existem. */
    let triedTrafficKeys = new Set<string>();
    /** Cancela a busca anterior quando o watchdog ou o timer disparam outro ciclo. */
    let fetchAbort: AbortController | undefined;
    /** Últimos problemas publicados nesta configuração — uma falha isolada não apaga o badge. */
    let latestProblems: HostProblemsMap = EMPTY_PROBLEMS;

    const ensureMetadata = async (abortSignal: AbortSignal): Promise<ZabbixDirectMetadata> => {
      if (!metadata) {
        metadata = await fetchZabbixDirectMetadata(datasourceUid, groupsRef.current, abortSignal);
      }
      return metadata;
    };

    const ensureTrafficItemIds = async (
      meta: ZabbixDirectMetadata,
      abortSignal: AbortSignal
    ): Promise<string[]> => {
      const numeric = trafficItemIdsRef.current.filter((id) => isNumericZabbixItemId(id));
      const pending = trafficKeysRef.current.filter((key) => !itemIdByKey.has(key) && !triedTrafficKeys.has(key));
      if (pending.length) {
        try {
          const hostids = meta.hosts.map((host) => host.hostid);
          const resolved = await resolveZabbixItemIdsByKeys(datasourceUid, pending, abortSignal, hostids);
          if (resolved.size) {
            itemIdByKey = new Map([...itemIdByKey, ...resolved]);
          }
          triedTrafficKeys = new Set([...triedTrafficKeys, ...pending]);
        } catch (err) {
          if (abortSignal.aborted) {
            throw err;
          }
        }
      }
      return [...new Set([...numeric, ...itemIdByKey.values()])];
    };

    const fetchSnapshot = async () => {
      if (cancelled) {
        return;
      }
      if (document.hidden && !inFlight && Date.now() - lastStartMs < POLL_WATCHDOG_MS) {
        return;
      }
      const allowed = canStartRefreshEventFetch(
        Date.now(),
        lastStartMs,
        inFlight,
        intervalSec * 1000
      );
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
        const [snapshot, trafficLastValues] = meta.resolvedGroups.length
          ? await Promise.all([
              fetchZabbixStatusViaQuery({
                datasourceUid,
                groupNames: meta.resolvedGroups,
                statusItemKey: itemKey,
                hosts: meta.hosts,
                abortSignal,
                refreshSec: intervalSec,
                timeRange: timeRangeRef.current,
                statusOptions: statusOptionsRef.current,
              }),
              (async () => {
                const resolvedTrafficIds = await ensureTrafficItemIds(meta, abortSignal);
                return fetchZabbixTrafficLastValuesViaQuery(
                  datasourceUid,
                  resolvedTrafficIds,
                  intervalSec,
                  abortSignal
                );
              })(),
            ])
          : [
              {
                items: [],
                hoverByHost: EMPTY_HOVER,
                lastValues: EMPTY_LAST_VALUES,
                problems: EMPTY_PROBLEMS,
              },
              EMPTY_LAST_VALUES,
            ];
        const lastValues = aliasLastValuesByItemKey(trafficLastValues, itemIdByKey);
        if (cancelled || generation <= lastPublishedGeneration) {
          return;
        }
        lastPublishedGeneration = generation;
        if (!snapshot.problemsUnavailable) {
          latestProblems = snapshot.problems;
        }
        if (!meta.resolvedGroups.length) {
          setState({
            index: EMPTY_INDEX,
            hoverByHost: EMPTY_HOVER,
            lastValues,
            problems: EMPTY_PROBLEMS,
            ready: false,
            loading: false,
            error: NO_GROUPS_ERROR,
          });
          return;
        }
        if (meta.hosts.length && !snapshot.items.length) {
          setState({
            index: EMPTY_INDEX,
            hoverByHost: EMPTY_HOVER,
            lastValues,
            problems: EMPTY_PROBLEMS,
            ready: false,
            loading: false,
            error: NO_STATUS_ITEMS_ERROR,
          });
          return;
        }

        const index = buildZabbixDirectIndex({
          datasourceUid,
          groupNames: groupsRef.current,
          statusItemKey: itemKey,
          hosts: meta.hosts,
          statusItems: snapshot.items,
        });
        consecutiveFailures = 0;
        setState({
          index,
          hoverByHost: snapshot.hoverByHost,
          lastValues,
          problems: latestProblems,
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
          setState((prev) => ({
            index: EMPTY_INDEX,
            hoverByHost: EMPTY_HOVER,
            lastValues: prev.lastValues,
            problems: prev.problems,
            ready: false,
            // Sem isto o painel ficava sem badge nenhum: mapa cinza e nenhuma pista do motivo.
            loading: retrying,
            error: retrying ? undefined : GENERIC_ERROR,
          }));
        }
      } finally {
        if (generation === fetchGeneration) {
          inFlight = false;
        }
      }
    };

    fetchSnapshotRef.current = () => {
      void fetchSnapshot();
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

    return () => {
      cancelled = true;
      fetchSnapshotRef.current = () => undefined;
      fetchAbort?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // `configKey` resume datasource, grupos, chave e intervalo num único valor estável.
  }, [enabled, configKey, datasourceUid, itemKey]);

  useLayoutEffect(() => {
    const refreshSub = eventBus?.getStream(RefreshEvent).subscribe(() => fetchSnapshotRef.current());
    return () => {
      refreshSub?.unsubscribe();
    };
  }, [eventBus]);

  return state;
}
