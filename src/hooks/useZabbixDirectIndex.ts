import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EventBus, TimeRange } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import {
  readZabbixSnapshot,
  writeZabbixSnapshot,
  zabbixSnapshotCacheKey,
  ZabbixSnapshotPayload,
} from '../services/zabbixSnapshotCache';
import {
  fetchZabbixDirectMetadata,
  fetchZabbixResolvedGroups,
  fetchZabbixSignalInventory,
  fetchZabbixTrafficLastValues,
  isBenignZabbixFetchError,
  isNumericZabbixItemId,
  ZabbixDirectMetadata,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
  ZabbixResolvedGroups,
} from '../utils/zabbixApi';
import { aliasLastValuesByItemKey, coalesceLinkTraffic } from '../utils/linkMetricsRuntime';
import { fetchZabbixStatusViaQuery, prefetchZabbixDatasource } from '../utils/zabbixDatasourceQuery';
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
 * A primeira pintura é só estrutura (`host.get`): caixas cinza, sem cor e sem tráfego — a menos
 * que exista snapshot em cache (abrir o dashboard de novo pinta status e cabos na hora). Cor e
 * cabos novos entram juntos no `commitSnapshot('full')`. Trocar grupos (abrir submapa, editar)
 * não zera o índice: o mapa continua com o último snapshot até o novo chegar. Mudar interface de
 * cabo também não remonta o poll — senão a pintura rápida sai sem status e todos os nós ficam cinza.
 *
 * O ciclo periódico chama `ds.query()` do datasource Zabbix: um POST com Metrics (status/hover)
 * e Problems (Warning+) no mesmo request — isso preenche sparkline e badge, depois da primeira
 * pintura. O tráfego e o sinal dos cabos lêem o `lastvalue` do `item.get` em paralelo, mas só
 * publicam no mesmo snapshot do status.
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
  /** Reduz o inventário de sinal recém-descoberto aos itens que os cabos realmente usam. */
  selectSignalItemIds?: (items: ZabbixInterfaceItem[]) => string[];
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
/**
 * Intervalo entre varreduras do inventário de sinal. Porta nova só aparece na próxima varredura;
 * editar a interface do cabo muda a configuração do poll e já força uma imediata.
 */
const SIGNAL_REDISCOVERY_MS = 10 * 60_000;
/**
 * Intervalo da releitura de identidade (`hostgroup.get` + `host.get`) e dos problemas. Host novo,
 * host desativado e badge de alerta aparecem dentro desta janela, não a cada refresh.
 */
const IDENTITY_REFRESH_MS = 60_000;
const IDLE_STATE: DirectState = {
  index: EMPTY_INDEX,
  hoverByHost: EMPTY_HOVER,
  lastValues: EMPTY_LAST_VALUES,
  interfaceItems: EMPTY_INTERFACE_ITEMS,
  problems: EMPTY_PROBLEMS,
  ready: false,
  loading: false,
};

function hydrateFromSnapshot(cached: ZabbixSnapshotPayload): DirectState {
  return {
    index: buildZabbixDirectIndex({
      datasourceUid: cached.datasourceUid,
      groupNames: cached.groupNames,
      statusItemKey: cached.statusItemKey,
      hosts: cached.hosts,
      statusItems: cached.statusItems,
    }),
    hoverByHost: cached.hoverByHost ?? EMPTY_HOVER,
    lastValues: cached.lastValues,
    interfaceItems: cached.interfaceItems,
    problems: cached.problems,
    ready: true,
    loading: false,
  };
}

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
  selectSignalItemIds,
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
   * Só identidade do poll: datasource, grupos, item de status e intervalo. Itemids/chaves de cabo
   * ficam em ref — se entrarem na chave, apagar uma interface remonta o efeito, a primeira pintura
   * sai sem status e o mapa inteiro fica cinza.
   */
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}`;
  const snapshotKey = zabbixSnapshotCacheKey(datasourceUid ?? '', groups, itemKey);
  const trafficConfigKey = `${trafficIds.join('\u0001')}\u0000${trafficItemKeys.join('\u0001')}\u0000${signalIds.join('\u0001')}\u0000${signalTerms.join('\u0001')}`;

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
  const selectSignalItemIdsRef = useRef(selectSignalItemIds);
  selectSignalItemIdsRef.current = selectSignalItemIds;
  /**
   * O Grafana recria o EventBus no carregamento do dashboard. Se o poll depende disso, o efeito
   * aborta o primeiro `ds.query()` e dispara outro — duas buscas iguais ao recarregar.
   */
  const fetchSnapshotRef = useRef<() => void>(() => undefined);
  const fetchTrafficRef = useRef<() => void>(() => undefined);
  const seenTrafficConfigKey = useRef(trafficConfigKey);

  const [state, setState] = useState<DirectState>(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      return IDLE_STATE;
    }
    const cached = readZabbixSnapshot(snapshotKey);
    return cached ? hydrateFromSnapshot(cached) : { ...IDLE_STATE, loading: true };
  });

  useLayoutEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      fetchSnapshotRef.current = () => undefined;
      fetchTrafficRef.current = () => undefined;
      setState(IDLE_STATE);
      return;
    }

    prefetchZabbixDatasource(datasourceUid);

    const warmSnapshot = readZabbixSnapshot(snapshotKey);
    setState((prev) => {
      if (warmSnapshot) {
        const hydrated = hydrateFromSnapshot(warmSnapshot);
        return { ...hydrated, loading: false };
      }
      return {
        index: prev.index,
        hoverByHost: prev.hoverByHost,
        lastValues: prev.lastValues,
        interfaceItems: prev.interfaceItems,
        problems: prev.problems,
        ready: prev.ready,
        loading: true,
        error: prev.error,
      };
    });

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
    /** `item.get` isolado (troca de cabo) — abort próprio, senão sobrevive ao unmount. */
    let trafficAbort: AbortController | undefined;
    /** Últimos problemas publicados nesta configuração — uma falha isolada não apaga o badge. */
    let latestProblems: HostProblemsMap = warmSnapshot?.problems ?? EMPTY_PROBLEMS;
    /** Tráfego já pintado — ciclo vazio (timeout/`item.get` falho) não apaga os cabos. */
    let lastTraffic = {
      lastValues: warmSnapshot?.lastValues ?? EMPTY_LAST_VALUES,
      interfaceItems: warmSnapshot?.interfaceItems ?? EMPTY_INTERFACE_ITEMS,
    };
    /** Itemids de sinal em uso pelos cabos; relidos por id enquanto não há redescoberta. */
    let knownSignalItemIds: string[] = [];
    /** Quando o inventário de sinal foi varrido pela última vez (0 = ainda não). */
    let lastSignalSearchMs = 0;
    /** A varredura de sinal não usa o abort do ciclo: ela sobrevive às trocas de ciclo. */
    let signalAbort: AbortController | undefined;
    let signalInFlight = false;
    /** Quando identidade e problemas foram relidos pela última vez (0 = ainda não). */
    let lastIdentityMs = 0;

    /*
     * Identidade (host novo, host desativado) e problemas mudam em minutos, não a cada refresh.
     * Fora da janela o ciclo fica só com `ds.query` de status e um `item.get` — duas requisições.
     */
    const isIdentityCycle = (): boolean => !metadata || Date.now() - lastIdentityMs >= IDENTITY_REFRESH_MS;

    const ensureMetadata = async (
      abortSignal: AbortSignal,
      identityCycle: boolean,
      resolved?: ZabbixResolvedGroups
    ): Promise<ZabbixDirectMetadata> => {
      if (metadata && !identityCycle) {
        return metadata;
      }
      metadata = await fetchZabbixDirectMetadata(
        datasourceUid,
        groupsRef.current,
        abortSignal,
        resolved ?? metadata
      );
      lastIdentityMs = Date.now();
      return metadata;
    };

    /**
     * Varredura do inventário de sinal — fora do caminho crítico, de propósito.
     *
     * Ela devolve toda porta óptica dos hosts dos cabos e leva segundos. Esperar por ela atrasava
     * a primeira pintura do mapa, e o ciclo seguinte ainda abortava a busca no meio. Aqui ela roda
     * solta, com abort próprio, e o que descobre entra por itemid no ciclo seguinte.
     */
    const startSignalDiscovery = (_meta: ZabbixDirectMetadata): void => {
      const terms = signalTermsRef.current;
      /*
       * Só os extremos dos cabos. Sem `signalHostIds` o fallback era `meta.hosts` — todos os
       * monitorados do grupo, inclusive CPE. Em produção isso vira um `item.get` de megabytes
       * (portas ópticas de OLT) na primeira carga. Sem ids ainda, espera o próximo ciclo.
       */
      const hostIds = signalIdsRef.current;
      const due = Date.now() - lastSignalSearchMs >= SIGNAL_REDISCOVERY_MS;
      if (signalInFlight || !due || !hostIds.length || !terms.length) {
        return;
      }
      signalInFlight = true;
      signalAbort = new AbortController();
      fetchZabbixSignalInventory(datasourceUid, hostIds, terms, signalAbort.signal)
        .then((items) => {
          lastSignalSearchMs = Date.now();
          knownSignalItemIds = (selectSignalItemIdsRef.current?.(items) ?? []).filter((id) =>
            isNumericZabbixItemId(id)
          );
        })
        .catch(() => {
          // Falhou: mantém os ids anteriores e tenta de novo no próximo ciclo, sem travar o mapa.
        })
        .finally(() => {
          signalInFlight = false;
        });
    };

    const fetchTrafficLastValues = async (
      meta: ZabbixDirectMetadata | undefined,
      abortSignal: AbortSignal
    ): Promise<{ lastValues: Record<string, ZabbixItemLastValue>; interfaceItems: ZabbixInterfaceItem[] }> => {
      const trafficNumeric = [
        ...new Set(
          [...trafficItemIdsRef.current, ...itemIdByKey.values()].filter((id) => isNumericZabbixItemId(id))
        ),
      ];
      const pending = trafficKeysRef.current.filter((key) => !itemIdByKey.has(key) && !triedTrafficKeys.has(key));
      const numeric = [...new Set([...trafficNumeric, ...knownSignalItemIds])];
      if (!numeric.length && !pending.length) {
        return { lastValues: EMPTY_LAST_VALUES, interfaceItems: EMPTY_INTERFACE_ITEMS };
      }
      try {
        const fetched = await fetchZabbixTrafficLastValues(
          datasourceUid,
          numeric,
          abortSignal,
          pending,
          meta?.hosts.map((host) => host.hostid)
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

    const publishTraffic = (traffic: {
      lastValues: Record<string, ZabbixItemLastValue>;
      interfaceItems: ZabbixInterfaceItem[];
    }) => {
      if (cancelled) {
        return;
      }
      const merged = coalesceLinkTraffic(traffic, lastTraffic);
      lastTraffic = merged;
      setState((prev) => ({
        ...prev,
        lastValues: aliasLastValuesByItemKey(merged.lastValues, itemIdByKey),
        interfaceItems: merged.interfaceItems,
      }));
    };

    fetchTrafficRef.current = () => {
      if (cancelled) {
        return;
      }
      trafficAbort?.abort();
      trafficAbort = new AbortController();
      const signal = trafficAbort.signal;
      void fetchTrafficLastValues(metadata, signal)
        .then((traffic) => {
          if (cancelled || signal.aborted) {
            return;
          }
          publishTraffic(traffic);
        })
        .catch(() => undefined);
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
      let publishedKind: 'none' | 'fast' | 'full' = 'none';
      const commitSnapshot = (
        meta: ZabbixDirectMetadata,
        statusItems: ZabbixInterfaceItem[],
        hoverByHost: HostHoverSeriesMap,
        lastValues: Record<string, ZabbixItemLastValue>,
        interfaceItems: ZabbixInterfaceItem[],
        problems: HostProblemsMap,
        problemsUnavailable: boolean | undefined,
        kind: 'fast' | 'full'
      ): boolean => {
        /*
         * Mesma geração pode pintar duas vezes: lastvalue primeiro, `ds.query()` depois (sparkline
         * e problemas). O caminho rápido não pode sobrescrever o completo se ele chegou antes.
         */
        if (cancelled || generation < lastPublishedGeneration) {
          return false;
        }
        if (kind === 'fast' && publishedKind !== 'none') {
          return false;
        }
        if (!problemsUnavailable) {
          latestProblems = problems;
        }
        if (!meta.resolvedGroups.length) {
          lastPublishedGeneration = generation;
          publishedKind = kind;
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
          return true;
        }
        if (meta.hosts.length && !statusItems.length && kind === 'full') {
          lastPublishedGeneration = generation;
          publishedKind = kind;
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
          return true;
        }
        lastPublishedGeneration = generation;
        publishedKind = kind;
        consecutiveFailures = 0;
        const traffic = coalesceLinkTraffic({ lastValues, interfaceItems }, lastTraffic);
        lastTraffic = traffic;
        setState((prev) => {
          const keepStatus =
            kind === 'fast' && !statusItems.length && prev.ready && prev.index.hosts.length > 0;
          const hover =
            kind === 'fast' &&
            Object.keys(hoverByHost).length === 0 &&
            Object.keys(prev.hoverByHost).length > 0
              ? prev.hoverByHost
              : hoverByHost;
          return {
            index: keepStatus
              ? prev.index
              : buildZabbixDirectIndex({
                  datasourceUid,
                  groupNames: groupsRef.current,
                  statusItemKey: itemKey,
                  hosts: meta.hosts,
                  statusItems,
                }),
            hoverByHost: hover,
            lastValues: traffic.lastValues,
            interfaceItems: traffic.interfaceItems,
            problems: latestProblems,
            ready: true,
            loading: false,
            error: undefined,
          };
        });
        if (kind === 'full') {
          startSignalDiscovery(meta);
          if (statusItems.length && meta.hosts.length) {
            writeZabbixSnapshot(snapshotKey, {
              datasourceUid,
              groupNames: groupsRef.current,
              statusItemKey: itemKey,
              hosts: meta.hosts,
              statusItems,
              lastValues: traffic.lastValues,
              interfaceItems: traffic.interfaceItems,
              problems: latestProblems,
              hoverByHost,
            });
          }
        }
        return true;
      };
      try {
        /*
         * O `item.get` dos cabos só precisa dos itemids do mapa — não espera o `host.get`.
         * No recarregar a frio o inventário de hosts leva segundos; o tráfego não precisa.
         */
        const trafficPromise = fetchTrafficLastValues(metadata, abortSignal);

        const identityCycle = isIdentityCycle();
        const groups = await fetchZabbixResolvedGroups(
          datasourceUid,
          groupsRef.current,
          abortSignal,
          metadata
        );
        if (!groups.resolvedGroups.length) {
          const traffic = await trafficPromise;
          commitSnapshot(
            { hosts: [], ...groups },
            [],
            EMPTY_HOVER,
            aliasLastValuesByItemKey(traffic.lastValues, itemIdByKey),
            traffic.interfaceItems,
            EMPTY_PROBLEMS,
            true,
            'full'
          );
          return;
        }

        const firstPaint = lastPublishedGeneration === 0;
        const meta = await ensureMetadata(abortSignal, identityCycle, groups);
        if (firstPaint && !warmSnapshot) {
          /*
           * Em produção um `item.get` de status por groupid puxa icmpping de todos os hosts do
           * grupo (milhares de CPE) — 5 MB e dezenas de segundos. O mapa pinta a estrutura assim
           * que o `host.get` volta; a cor chega no `ds.query()` em seguida. Com snapshot em
           * cache essa pintura cinza não roda — o dashboard já abre com status e tráfego.
           */
          commitSnapshot(
            meta,
            [],
            EMPTY_HOVER,
            EMPTY_LAST_VALUES,
            EMPTY_INTERFACE_ITEMS,
            latestProblems,
            true,
            'fast'
          );
        }

        /*
         * Sparkline + problemas só depois da primeira pintura. A frio o `ds.query()` leva
         * segundos; esperar por ele atrasava a estrutura. O `item.get` dos cabos já saiu em
         * paralelo, mas só entra no estado no `commitSnapshot('full')` — junto com a cor.
         */
        const snapshotPromise = fetchZabbixStatusViaQuery({
          datasourceUid,
          groupNames: meta.resolvedGroups,
          statusItemKey: itemKey,
          hosts: meta.hosts,
          abortSignal,
          refreshSec: intervalSec,
          timeRange: timeRangeRef.current,
          statusOptions: statusOptionsRef.current,
          includeProblems: identityCycle,
        });
        const [snapshot, traffic] = await Promise.all([
          snapshotPromise,
          trafficPromise.catch(() => ({
            lastValues: EMPTY_LAST_VALUES,
            interfaceItems: EMPTY_INTERFACE_ITEMS,
          })),
        ]);
        commitSnapshot(
          meta,
          snapshot.items,
          snapshot.hoverByHost,
          aliasLastValuesByItemKey(traffic.lastValues, itemIdByKey),
          traffic.interfaceItems,
          snapshot.problems,
          snapshot.problemsUnavailable,
          'full'
        );
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
      fetchTrafficRef.current = () => undefined;
      fetchAbort?.abort();
      trafficAbort?.abort();
      signalAbort?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // `configKey` resume datasource, grupos, chave e intervalo num único valor estável.
  }, [enabled, configKey, datasourceUid, itemKey]);

  useLayoutEffect(() => {
    if (seenTrafficConfigKey.current === trafficConfigKey) {
      return;
    }
    seenTrafficConfigKey.current = trafficConfigKey;
    fetchTrafficRef.current();
  }, [trafficConfigKey]);

  useLayoutEffect(() => {
    const refreshSub = eventBus?.getStream(RefreshEvent).subscribe(() => fetchSnapshotRef.current());
    return () => {
      refreshSub?.unsubscribe();
    };
  }, [eventBus]);

  return state;
}
