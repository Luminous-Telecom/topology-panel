import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZABBIX_DIRECT_DEFAULT_REFRESH_SEC, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';
import {
  persistZabbixItemIdCatalog,
  readZabbixItemIdCatalog,
  zabbixSnapshotCacheKey,
  ZabbixItemIdCatalog,
} from '../services/zabbixSnapshotCache';
import { fetchLiveSnapshot, persistLiveSnapshot, type BackendLiveSnapshot } from '../services/pluginBackend';
import {
  fetchZabbixDirectMetadata,
  fetchZabbixProblems,
  fetchZabbixResolvedGroups,
  fetchZabbixStatusLastValues,
  fetchZabbixTrafficLastValues,
  isBenignZabbixFetchError,
  isNumericZabbixItemId,
  mergeItemIdByKey,
  sameHostProblems,
  sameLastValuesForPaint,
  sameStatusItemsLastValue,
  statusItemSearch,
  zabbixHostItemKey,
  ZabbixDirectMetadata,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
  ZabbixResolvedGroups,
} from '../utils/zabbixApi';
import { aliasLastValuesByItemKey, coalesceLinkTraffic } from '../utils/linkMetricsRuntime';
import { HostProblemsMap } from '../utils/noc/types';
import {
  canStartPolledFetch,
  markPollFinished,
  markPollStarted,
  msUntilNextPoll,
  readPollClock,
} from '../utils/pollingGate';

/**
 * Busca periódica do último valor no Zabbix.
 *
 * O painel não usa a aba Query, então o polling vive aqui. O único timer é o
 * `zabbixRefreshSec` do plugin: a primeira busca quando a chave ainda não buscou, depois um
 * ciclo a cada intervalo. Em regime o lastvalue sai num `item.get` só, pelos itemids já
 * conhecidos. Identidade (`host.get`) e problemas (`problem.get` + `trigger.get`) só na
 * descoberta — o grafana-zabbix aceita um método por POST, e três chamadas no intervalo
 * pintavam o Network. O relógio mora fora do React — remontar o painel não dispara outro ciclo.
 *
 * A primeira pintura usa o snapshot do backend Go se ainda estiver quente (outro operador ou
 * F5 neste Grafana). Sem isso espera o lastvalue **ao vivo** do `item.get` — não hidrata
 * lastvalue de localStorage (caixa cinza). Catálogo de itemids só acelera o POST. `host.get`
 * e problemas não repetem no intervalo.
 *
 * Lastvalue igual: não redesenha o índice. Lastvalue de cabo novo reusa o índice de hosts.
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
  /** Itemids de RX/TX dos cabos — lastvalue no mesmo `item.get` do status. */
  trafficItemIds?: string[];
  /** Chaves dos cabos sem itemid numérico — resolvidas uma vez via `item.get`. */
  trafficKeys?: string[];
}

export interface UseZabbixDirectIndexResult {
  index: QueryIndex;
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

function numericStatusItemIds(items: ZabbixInterfaceItem[]): string[] {
  return [...new Set(items.map((item) => item.itemid.trim()).filter((id) => isNumericZabbixItemId(id)))];
}

/**
 * Dá para reler o status no mesmo `item.get` dos cabos: todo host tem itemid numérico conhecido.
 * Senão (primeira carga, host novo, itemid ainda não resolvido) volta o `item.get` por hostids.
 */
function statusItemsCoverHosts(items: ZabbixInterfaceItem[], hostids: string[]): boolean {
  if (!hostids.length || !items.length || numericStatusItemIds(items).length !== items.length) {
    return false;
  }
  const covered = new Set(items.map((item) => item.hostid?.trim()).filter(Boolean));
  return hostids.every((id) => covered.has(id));
}

function statusLastValuesPresent(
  lastValues: Record<string, ZabbixItemLastValue>,
  items: ZabbixInterfaceItem[]
): boolean {
  const hasIncoming = items.some((item) => {
    const id = item.itemid.trim();
    return isNumericZabbixItemId(id) && lastValues[id]?.lastvalue !== undefined;
  });
  if (hasIncoming) {
    return true;
  }
  return items.some((item) => item.lastvalue !== undefined);
}

function statusItemsFromCatalog(catalog: ZabbixItemIdCatalog | undefined): ZabbixInterfaceItem[] {
  if (!catalog?.statusItems.length) {
    return [];
  }
  return catalog.statusItems;
}

function itemIdByKeyFromCatalog(catalog: ZabbixItemIdCatalog | undefined): Map<string, string> {
  const next = new Map<string, string>();
  if (!catalog) {
    return next;
  }
  for (const [scoped, id] of Object.entries(catalog.itemIdByKey)) {
    const trimmed = id.trim();
    if (!scoped.includes(':') || !isNumericZabbixItemId(trimmed)) {
      continue;
    }
    next.set(scoped, trimmed);
  }
  return next;
}

/** A chave do mapa é `hostid:key`; a `trafficKeys` do cabo vem sem hostid. */
function trafficKeyIsResolved(itemIdByKey: Map<string, string>, key: string): boolean {
  if (itemIdByKey.has(key)) {
    return true;
  }
  const suffix = `:${key}`;
  for (const scoped of itemIdByKey.keys()) {
    if (scoped.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

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

/** Sessão desta aba — sobrevive à remontagem do Grafana, não ao F5. Sem lastvalue de localStorage. */
interface LiveSession {
  state: DirectState;
  metadata: ZabbixDirectMetadata;
  knownStatusItems: ZabbixInterfaceItem[];
}

const liveSessionByKey = new Map<string, LiveSession>();

/** Testes: simula F5 (some o lastvalue em memória; o catálogo de itemids permanece). */
export function dropZabbixLiveIndex(): void {
  liveSessionByKey.clear();
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
  /*
   * Só identidade do poll: datasource, grupos, item de status e intervalo. Itemids/chaves de cabo
   * ficam em ref — se entrarem na chave, apagar uma interface remonta o efeito, a primeira pintura
   * sai sem status e o mapa inteiro fica cinza.
   */
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}`;
  const snapshotKey = zabbixSnapshotCacheKey(datasourceUid ?? '', groups, itemKey);

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const trafficItemIdsRef = useRef(trafficIds);
  trafficItemIdsRef.current = trafficIds;
  const trafficKeysRef = useRef(trafficItemKeys);
  trafficKeysRef.current = trafficItemKeys;
  const [state, setState] = useState<DirectState>(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      return IDLE_STATE;
    }
    return liveSessionByKey.get(snapshotKey)?.state ?? { ...IDLE_STATE, loading: true };
  });

  useLayoutEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey) {
      setState(IDLE_STATE);
      return;
    }

    const live = liveSessionByKey.get(snapshotKey);
    setState((prev) => {
      if (live) {
        return { ...live.state, loading: false };
      }
      if (prev.ready) {
        return { ...prev, loading: true };
      }
      return { ...IDLE_STATE, loading: true };
    });

    let cancelled = false;
    let fetchGeneration = 0;
    const clockKey = snapshotKey;
    const intervalMs = intervalSec * 1000;
    /**
     * Só descarta resultado mais antigo do que o já publicado. Comparar com a geração em voo
     * fazia um snapshot lento ser jogado fora toda vez que o watchdog liberava outro ciclo — o
     * mapa nunca recebia status e ficava cinza indefinidamente.
     */
    let lastPublishedGeneration = 0;
    /** Timeout/abort isolado só vira erro visível na segunda falha seguida. */
    let consecutiveFailures = 0;
    /** Identidade da descoberta; em regime não relê `host.get` (seria outro POST). */
    let metadata: ZabbixDirectMetadata | undefined = live?.metadata;
    const itemIdCatalog = readZabbixItemIdCatalog(snapshotKey);
    /** itemid numérico por key — só busca as chaves que ainda não resolveram. */
    let itemIdByKey = itemIdByKeyFromCatalog(itemIdCatalog);
    /** Chaves já pedidas ao `item.get` nesta configuração — não repete as que não existem. */
    let triedTrafficKeys = new Set<string>();
    /** Cancela a busca anterior quando o watchdog ou o timer disparam outro ciclo. */
    let fetchAbort: AbortController | undefined;
    /** Tráfego já pintado nesta aba — ciclo vazio não apaga os cabos. */
    let lastTraffic = {
      lastValues: live?.state.lastValues ?? EMPTY_LAST_VALUES,
      interfaceItems: live?.state.interfaceItems ?? EMPTY_INTERFACE_ITEMS,
    };
    /** Itens de status já descobertos — o ciclo em regime relê lastvalue no mesmo `item.get`. */
    let knownStatusItems: ZabbixInterfaceItem[] = live?.knownStatusItems?.length
      ? live.knownStatusItems
      : statusItemsFromCatalog(itemIdCatalog);
    /** Warning+ — só na descoberta; o intervalo não gasta POST extra. */
    let currentProblems: HostProblemsMap = live?.state.problems ?? EMPTY_PROBLEMS;

    /*
     * Identidade e problemas só na descoberta. Em regime o intervalo é um `item.get`.
     */
    const ensureMetadata = async (
      abortSignal: AbortSignal,
      resolved?: ZabbixResolvedGroups
    ): Promise<ZabbixDirectMetadata> => {
      metadata = await fetchZabbixDirectMetadata(
        datasourceUid,
        groupsRef.current,
        abortSignal,
        resolved ?? metadata
      );
      return metadata;
    };

    const loadProblems = async (
      meta: ZabbixDirectMetadata,
      abortSignal: AbortSignal
    ): Promise<void> => {
      const hostids = meta.hosts.map((host) => host.hostid);
      if (!hostids.length || !meta.groupIds.length) {
        return;
      }
      try {
        currentProblems = await fetchZabbixProblems(
          datasourceUid,
          hostids,
          meta.groupIds,
          abortSignal
        );
      } catch (err) {
        if (abortSignal.aborted) {
          throw err;
        }
      }
    };

    const rememberTrafficItems = (items: ZabbixInterfaceItem[]): void => {
      mergeItemIdByKey(itemIdByKey, items);
    };

    const pendingTrafficKeys = (): string[] =>
      trafficKeysRef.current.filter(
        (key) => !trafficKeyIsResolved(itemIdByKey, key) && !triedTrafficKeys.has(key)
      );

    const absorbTrafficFromStatusFetch = (
      fetched: ZabbixInterfaceItem[],
      extraKeys: string[]
    ): ZabbixInterfaceItem[] => {
      const statusKey = statusItemSearch(itemKey).key_;
      const statusItems =
        statusKey && extraKeys.length
          ? fetched.filter((item) => item.key_ === statusKey)
          : fetched;
      if (statusKey && extraKeys.length) {
        const trafficItems = fetched.filter((item) => item.key_ !== statusKey);
        rememberTrafficItems(trafficItems);
        const trafficValues: Record<string, ZabbixItemLastValue> = {};
        for (const item of trafficItems) {
          const id = item.itemid.trim();
          if (!isNumericZabbixItemId(id)) {
            continue;
          }
          const stored: ZabbixItemLastValue = { itemid: id };
          if (item.lastvalue !== undefined) {
            stored.lastvalue = item.lastvalue;
          }
          trafficValues[id] = stored;
          const hostid = item.hostid?.trim();
          const key = item.key_?.trim();
          if (hostid && key) {
            trafficValues[zabbixHostItemKey(hostid, key)] = stored;
          }
        }
        lastTraffic = coalesceLinkTraffic(
          { lastValues: trafficValues, interfaceItems: trafficItems },
          lastTraffic
        );
        triedTrafficKeys = new Set([...triedTrafficKeys, ...extraKeys]);
      }
      return statusItems;
    };

    const fetchPendingKeyTraffic = async (
      hostids: string[],
      extraKeys: string[],
      abortSignal: AbortSignal
    ): Promise<void> => {
      if (!extraKeys.length) {
        return;
      }
      try {
        const fetched = await fetchZabbixTrafficLastValues(
          datasourceUid,
          [],
          abortSignal,
          extraKeys,
          hostids
        );
        if (fetched.itemIdByKey.size) {
          itemIdByKey = new Map([...itemIdByKey, ...fetched.itemIdByKey]);
        }
        rememberTrafficItems(fetched.interfaceItems);
        lastTraffic = coalesceLinkTraffic(
          {
            lastValues: aliasLastValuesByItemKey(fetched.lastValues, itemIdByKey),
            interfaceItems: fetched.interfaceItems,
          },
          lastTraffic
        );
        triedTrafficKeys = new Set([...triedTrafficKeys, ...extraKeys]);
      } catch (err) {
        if (abortSignal.aborted) {
          throw err;
        }
      }
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
      const numeric = [...new Set([...trafficNumeric, ...numericStatusItemIds(knownStatusItems)])];
      const pending = numeric.length
        ? []
        : pendingTrafficKeys();
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

    const persistCatalog = (
      statusItems: ZabbixInterfaceItem[],
      traffic: { lastValues: Record<string, ZabbixItemLastValue>; interfaceItems: ZabbixInterfaceItem[] }
    ): void => {
      if (!statusItems.length) {
        return;
      }
      persistZabbixItemIdCatalog(snapshotKey, {
        statusItems,
        lastValues: traffic.lastValues,
        interfaceItems: traffic.interfaceItems,
      });
    };

    const fetchSnapshot = async () => {
      if (cancelled) {
        return;
      }
      const clock = readPollClock(clockKey);
      if (document.hidden && clock.lastStartMs != null) {
        return;
      }
      const nowMs = Date.now();
      const allowed = canStartPolledFetch(
        nowMs,
        clock.lastStartMs,
        clock.inFlight,
        intervalMs,
        Number.POSITIVE_INFINITY
      );
      if (!allowed) {
        return;
      }
      markPollStarted(clockKey, nowMs);
      const generation = ++fetchGeneration;
      fetchAbort?.abort();
      fetchAbort = new AbortController();
      const abortSignal = fetchAbort.signal;
      const commitSnapshot = (
        meta: ZabbixDirectMetadata,
        statusItems: ZabbixInterfaceItem[],
        lastValues: Record<string, ZabbixItemLastValue>,
        interfaceItems: ZabbixInterfaceItem[]
      ): boolean => {
        if (cancelled || generation < lastPublishedGeneration) {
          return false;
        }
        if (!meta.resolvedGroups.length) {
          lastPublishedGeneration = generation;
          setState({
            index: EMPTY_INDEX,
            lastValues,
            interfaceItems,
            problems: EMPTY_PROBLEMS,
            ready: false,
            loading: false,
            error: NO_GROUPS_ERROR,
          });
          return true;
        }
        if (meta.hosts.length && !statusItems.length) {
          lastPublishedGeneration = generation;
          setState({
            index: EMPTY_INDEX,
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
        consecutiveFailures = 0;
        const traffic = coalesceLinkTraffic({ lastValues, interfaceItems }, lastTraffic);
        lastTraffic = traffic;
        const prevSession = liveSessionByKey.get(snapshotKey);
        const prevLive = prevSession?.state;
        if (prevLive?.ready && sameLastValuesForPaint(traffic.lastValues, prevLive.lastValues)) {
          persistCatalog(statusItems, traffic);
          void persistLiveSnapshot(snapshotKey, {
            savedAt: Date.now(),
            metadata: meta,
            knownStatusItems: statusItems,
            lastValues: traffic.lastValues,
            interfaceItems: traffic.interfaceItems,
            problems: currentProblems,
          });
          if (!sameHostProblems(currentProblems, prevLive.problems)) {
            const next: DirectState = { ...prevLive, problems: currentProblems };
            liveSessionByKey.set(snapshotKey, {
              state: next,
              metadata: meta,
              knownStatusItems: statusItems,
            });
            setState(next);
          }
          return true;
        }
        const reuseHostIndex =
          Boolean(prevLive?.ready) &&
          sameStatusItemsLastValue(statusItems, prevSession?.knownStatusItems ?? []);
        const next: DirectState = {
          index:
            reuseHostIndex && prevLive
              ? prevLive.index
              : buildZabbixDirectIndex({
                  datasourceUid,
                  groupNames: groupsRef.current,
                  statusItemKey: itemKey,
                  hosts: meta.hosts,
                  statusItems,
                }),
          lastValues: traffic.lastValues,
          interfaceItems: traffic.interfaceItems,
          problems: currentProblems,
          ready: true,
          loading: false,
          error: undefined,
        };
        liveSessionByKey.set(snapshotKey, {
          state: next,
          metadata: meta,
          knownStatusItems: statusItems,
        });
        setState(next);
        persistCatalog(statusItems, traffic);
        void persistLiveSnapshot(snapshotKey, {
          savedAt: Date.now(),
          metadata: meta,
          knownStatusItems: statusItems,
          lastValues: traffic.lastValues,
          interfaceItems: traffic.interfaceItems,
          problems: currentProblems,
        });
        return true;
      };
      const publishByItemIds = async (
        meta: ZabbixDirectMetadata,
        extraKeys: string[]
      ): Promise<boolean> => {
        const hostids = meta.hosts.map((host) => host.hostid);
        if (!statusItemsCoverHosts(knownStatusItems, hostids)) {
          return false;
        }
        const traffic = await fetchTrafficLastValues(meta, abortSignal);
        if (cancelled || abortSignal.aborted) {
          return false;
        }
        if (!statusLastValuesPresent(traffic.lastValues, knownStatusItems)) {
          return false;
        }
        lastTraffic = coalesceLinkTraffic(traffic, lastTraffic);
        if (extraKeys.length) {
          await fetchPendingKeyTraffic(hostids, extraKeys, abortSignal);
          if (cancelled || abortSignal.aborted) {
            return false;
          }
        }
        const statusItems = applyLastValuesToStatusItems(
          knownStatusItems,
          lastTraffic.lastValues,
          lastTraffic.interfaceItems
        );
        knownStatusItems = statusItems;
        commitSnapshot(meta, statusItems, lastTraffic.lastValues, lastTraffic.interfaceItems);
        return true;
      };
      try {
        if (metadata && (await publishByItemIds(metadata, pendingTrafficKeys()))) {
          return;
        }

        const groups = await fetchZabbixResolvedGroups(
          datasourceUid,
          groupsRef.current,
          abortSignal,
          metadata
        );
        if (!groups.resolvedGroups.length) {
          commitSnapshot(
            { hosts: [], ...groups },
            [],
            lastTraffic.lastValues,
            lastTraffic.interfaceItems
          );
          return;
        }

        const meta = await ensureMetadata(abortSignal, groups);
        await loadProblems(meta, abortSignal);

        if (await publishByItemIds(meta, pendingTrafficKeys())) {
          return;
        }

        const hostids = meta.hosts.map((host) => host.hostid);
        const extraKeys = pendingTrafficKeys();
        const extraInStatus = statusItemSearch(itemKey).key_ ? extraKeys : [];
        const fetched = await fetchZabbixStatusLastValues(
          datasourceUid,
          itemKey,
          hostids,
          abortSignal,
          extraInStatus
        );
        let statusItems = absorbTrafficFromStatusFetch(fetched, extraInStatus);
        if (!statusItems.length && knownStatusItems.length) {
          statusItems = knownStatusItems;
        }
        knownStatusItems = statusItems;
        if (extraKeys.length && !extraInStatus.length) {
          await fetchPendingKeyTraffic(hostids, extraKeys, abortSignal);
          if (cancelled || abortSignal.aborted) {
            return;
          }
        }
        /*
         * Sem chave pendente, o lastvalue de status+cabos sai num `item.get` por itemid.
         * Com chave pendente o lastvalue já veio (status+keys ou item.get pelas keys) —
         * um segundo POST por itemid apagava o tráfego das chaves.
         */
        if (
          !extraKeys.length &&
          trafficItemIdsRef.current.some((id) => isNumericZabbixItemId(id))
        ) {
          const traffic = await fetchTrafficLastValues(meta, abortSignal);
          if (cancelled || abortSignal.aborted) {
            return;
          }
          statusItems = applyLastValuesToStatusItems(
            statusItems,
            traffic.lastValues,
            traffic.interfaceItems
          );
          knownStatusItems = statusItems;
          lastTraffic = coalesceLinkTraffic(traffic, lastTraffic);
        }
        commitSnapshot(meta, statusItems, lastTraffic.lastValues, lastTraffic.interfaceItems);
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
          markPollFinished(clockKey);
        }
      }
    };

    const applyRemoteSnapshot = (remote: BackendLiveSnapshot): boolean => {
      if (!remote.metadata.resolvedGroups.length) {
        return false;
      }
      const statusItems = remote.knownStatusItems;
      if (remote.metadata.hosts.length && !statusItems.length) {
        return false;
      }
      metadata = remote.metadata;
      knownStatusItems = statusItems;
      currentProblems = remote.problems ?? EMPTY_PROBLEMS;
      lastTraffic = coalesceLinkTraffic(
        {
          lastValues: remote.lastValues ?? EMPTY_LAST_VALUES,
          interfaceItems: remote.interfaceItems ?? EMPTY_INTERFACE_ITEMS,
        },
        lastTraffic
      );
      rememberTrafficItems(statusItems);
      rememberTrafficItems(lastTraffic.interfaceItems);
      const next: DirectState = {
        index: buildZabbixDirectIndex({
          datasourceUid: datasourceUid ?? '',
          groupNames: groupsRef.current,
          statusItemKey: itemKey,
          hosts: metadata.hosts,
          statusItems,
        }),
        lastValues: lastTraffic.lastValues,
        interfaceItems: lastTraffic.interfaceItems,
        problems: currentProblems,
        ready: true,
        loading: false,
        error: undefined,
      };
      liveSessionByKey.set(snapshotKey, {
        state: next,
        metadata,
        knownStatusItems: statusItems,
      });
      persistCatalog(statusItems, lastTraffic);
      setState(next);
      if (remote.savedAt > 0) {
        markPollStarted(clockKey, remote.savedAt);
        markPollFinished(clockKey);
      }
      return true;
    };

    /*
     * Só busca na hora se esta chave ainda não largou um ciclo. Senão espera o resto do
     * intervalo — o Grafana remonta o painel e um `void fetchSnapshot()` aqui virava +4 POSTs.
     * Snapshot quente do backend (F5 / outro operador) pinta antes do `item.get`.
     */
    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    const startInterval = () => {
      intervalId = window.setInterval(() => void fetchSnapshot(), intervalMs);
    };
    const armPoll = () => {
      const waitMs = msUntilNextPoll(clockKey, intervalMs, Date.now());
      if (waitMs <= 0) {
        void fetchSnapshot();
        startInterval();
        return;
      }
      timeoutId = window.setTimeout(() => {
        void fetchSnapshot();
        startInterval();
      }, waitMs);
    };
    void (async () => {
      if (!live?.state.ready) {
        const remote = await fetchLiveSnapshot(snapshotKey);
        if (!cancelled && remote && !liveSessionByKey.get(snapshotKey)?.state.ready) {
          applyRemoteSnapshot(remote);
        }
      }
      if (!cancelled) {
        armPoll();
      }
    })();

    return () => {
      cancelled = true;
      fetchAbort?.abort();
      markPollFinished(clockKey);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
    // `configKey` resume datasource, grupos, chave e intervalo num único valor estável.
  }, [enabled, configKey, datasourceUid, itemKey, snapshotKey]);

  return state;
}

