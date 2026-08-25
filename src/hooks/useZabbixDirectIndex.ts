import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EventBus, TimeRange } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import {
  fetchZabbixDirectMetadata,
  fetchZabbixTrafficLastValues,
  isBenignZabbixFetchError,
  isNumericZabbixItemId,
  ZabbixDirectMetadata,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
} from '../utils/zabbixApi';
import { aliasLastValuesByItemKey } from '../utils/linkMetricsRuntime';
import { fetchZabbixStatusViaQuery } from '../utils/zabbixDatasourceQuery';
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
 * e Problems (Warning+) no mesmo request. O tráfego e o sinal dos cabos lêem o `lastvalue` do
 * `item.get` em paralelo nesse mesmo ciclo — o Zabbix já guarda o valor atual (preprocessing
 * vira bps). Cabo só com `key` resolve itemid e lastvalue na mesma chamada.
 * A identidade dos hosts (IP, tags, descrição) vem de `host.get` a cada ciclo — o DataFrame
 * não traz isso, e só a lista atual de monitorados evita status fantasma de host desativado.
 * O `RefreshEvent` do dashboard não recomeça este efeito — o Grafana recria o EventBus no load
 * e isso abortava o primeiro `ds.query()` para disparar outro.
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
  /** Hosts dos cabos com interface — sinal óptico/rádio no mesmo `item.get`. */
  signalHostIds?: string[];
  /** Termos de busca de sinal (óptico/rádio) no mesmo `item.get` do tráfego. */
  signalSearchTerms?: string[];
}

export interface UseZabbixDirectIndexResult {
  index: QueryIndex;
  hoverByHost: HostHoverSeriesMap;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
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
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
}

const EMPTY_HOVER: HostHoverSeriesMap = {};
const EMPTY_LAST_VALUES: Record<string, ZabbixItemLastValue> = {};
const EMPTY_INTERFACE_ITEMS: ZabbixInterfaceItem[] = [];
const EMPTY_PROBLEMS: HostProblemsMap = {};
const IDLE_STATE: DirectState = {
  index: EMPTY_INDEX,
  hoverByHost: EMPTY_HOVER,
  lastValues: EMPTY_LAST_VALUES,
  interfaceItems: EMPTY_INTERFACE_ITEMS,
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
  signalHostIds,
  signalSearchTerms,
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
  const signalIds = useMemo(
    () => [...new Set((signalHostIds ?? []).map((id) => id.trim()).filter(Boolean))].sort(),
    [signalHostIds]
  );
  const signalTerms = useMemo(
    () => [...new Set((signalSearchTerms ?? []).map((term) => term.trim()).filter(Boolean))].sort(),
    [signalSearchTerms]
  );
  /*
   * Os grupos da árvore não mudam ao abrir um submapa. Sem as chaves/ids do mapa visível aqui,
   * o efeito não recomeça e o tráfego do APD esperava o próximo ciclo (ou o watchdog).
   */
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}\u0000${trafficIds.join('\u0001')}\u0000${trafficItemKeys.join('\u0001')}\u0000${signalIds.join('\u0001')}\u0000${signalTerms.join('\u0001')}`;

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
  const signalIdsRef = useRef(signalIds);
  signalIdsRef.current = signalIds;
  const signalTermsRef = useRef(signalTerms);
  signalTermsRef.current = signalTerms;
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
      interfaceItems: prev.interfaceItems,
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
    /** Última identidade boa; o ciclo relê `host.get` para tirar host desativado do índice. */
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
      metadata = await fetchZabbixDirectMetadata(datasourceUid, groupsRef.current, abortSignal);
      return metadata;
    };

    const fetchTrafficLastValues = async (
      meta: ZabbixDirectMetadata,
      abortSignal: AbortSignal
    ): Promise<{ lastValues: Record<string, ZabbixItemLastValue>; interfaceItems: ZabbixInterfaceItem[] }> => {
      const numeric = [
        ...new Set(
          [...trafficItemIdsRef.current, ...itemIdByKey.values()].filter((id) => isNumericZabbixItemId(id))
        ),
      ];
      const pending = trafficKeysRef.current.filter((key) => !itemIdByKey.has(key) && !triedTrafficKeys.has(key));
      const signalTerms = signalTermsRef.current;
      const signalHostIds = signalIdsRef.current.length
        ? signalIdsRef.current
        : signalTerms.length && (numeric.length || pending.length)
          ? meta.hosts.map((host) => host.hostid)
          : [];
      const signalSearch =
        signalHostIds.length && signalTerms.length ? { hostids: signalHostIds, terms: signalTerms } : undefined;
      if (!numeric.length && !pending.length && !signalSearch) {
        return { lastValues: EMPTY_LAST_VALUES, interfaceItems: EMPTY_INTERFACE_ITEMS };
      }
      try {
        const fetched = await fetchZabbixTrafficLastValues(
          datasourceUid,
          numeric,
          abortSignal,
          pending,
          meta.hosts.map((host) => host.hostid),
          signalSearch
        );
        if (fetched.itemIdByKey.size) {
          itemIdByKey = new Map([...itemIdByKey, ...fetched.itemIdByKey]);
        }
        if (pending.length) {
          triedTrafficKeys = new Set([...triedTrafficKeys, ...pending]);
        }
        return {
          lastValues: aliasLastValuesByItemKey(fetched.lastValues, itemIdByKey),
          interfaceItems: fetched.interfaceItems,
        };
      } catch (err) {
        if (abortSignal.aborted) {
          throw err;
        }
        return { lastValues: EMPTY_LAST_VALUES, interfaceItems: EMPTY_INTERFACE_ITEMS };
      }
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
        const [snapshot, traffic] = meta.resolvedGroups.length
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
              fetchTrafficLastValues(meta, abortSignal),
            ])
          : [
              {
                items: [],
                hoverByHost: EMPTY_HOVER,
                lastValues: EMPTY_LAST_VALUES,
                problems: EMPTY_PROBLEMS,
              },
              { lastValues: EMPTY_LAST_VALUES, interfaceItems: EMPTY_INTERFACE_ITEMS },
            ];
        const lastValues = aliasLastValuesByItemKey(traffic.lastValues, itemIdByKey);
        const interfaceItems = traffic.interfaceItems;
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
            interfaceItems,
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
            interfaceItems,
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
          interfaceItems,
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
            interfaceItems: prev.interfaceItems,
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
