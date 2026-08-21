import { useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions, ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { createAsyncCache } from '../services/asyncCache';
import {
  buildLinkRuntimeMetricsMap,
  collectLinkMetricItemIds,
  utilizationThresholdsFromOptions,
} from '../utils/linkMetricsRuntime';
import { fetchZabbixItemLastValues } from '../utils/zabbixApi';
import { POLL_WATCHDOG_MS, canStartPolledFetch } from '../utils/pollingGate';
import { structuralShare } from '../utils/structuralIdentity';

/**
 * Dedupe de remount/corrida — estritamente abaixo do piso de 5s do modo Zabbix, para o tick
 * mínimo não cair no cache do mount no limite exato.
 */
const LINK_METRICS_TTL_MS = 3_000;

/** Identidade única para "sem métrica" — ver comentário no efeito abaixo. */
const EMPTY_LINK_METRICS: LinkRuntimeMetricsMap = {};

const metricsCache = createAsyncCache<LinkRuntimeMetricsMap>({
  ttlMs: LINK_METRICS_TTL_MS,
});

export interface UseLinkMetricsRuntimeResult {
  metricsByLink: LinkRuntimeMetricsMap;
  loading: boolean;
  stale: boolean;
  /** Relógio da última busca boa — o lastclock do item Zabbix pode ser bem mais velho. */
  fetchedAtMs?: number;
}

export interface UseLinkMetricsRuntimeOptions {
  /** Intervalo periódico em segundos; `null` = só manual / RefreshEvent. */
  refreshSec?: number | null;
  eventBus?: EventBus;
}

/**
 * Métricas voláteis de links (RX/TX/utilização/status) — não persistidas no JSON.
 * Atualiza em lote via item.get + último ponto do history.get (igual ao status dos hosts).
 * Polling no zabbixRefreshSec; dedupe curto (3s) só no remount.
 */
export function useLinkMetricsRuntime(
  datasourceUid: string | undefined,
  map: TopologyMap,
  options: TopologyPanelOptions,
  enabled = true,
  runtimeOptions: UseLinkMetricsRuntimeOptions = {}
): UseLinkMetricsRuntimeResult {
  const { refreshSec = null, eventBus } = runtimeOptions;
  const itemIds = useMemo(() => collectLinkMetricItemIds(map.links), [map.links]);
  const itemKey = useMemo(() => [...itemIds].sort().join('\0'), [itemIds]);
  const thresholds = useMemo(() => utilizationThresholdsFromOptions(options), [
    options.linkUtilThresholdAttention,
    options.linkUtilThresholdHigh,
    options.linkUtilThresholdCritical,
  ]);
  const [metricsByLink, setMetricsByLink] = useState<LinkRuntimeMetricsMap>({});
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [fetchedAtMs, setFetchedAtMs] = useState<number | undefined>();
  const lastGoodRef = useRef<LinkRuntimeMetricsMap>({});

  const mapRef = useRef(map);
  mapRef.current = map;
  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;

  const cacheKey = `${datasourceUid ?? ''}\u0000linkmetrics\u0000${itemKey}`;

  useEffect(() => {
    if (!enabled || !datasourceUid || !itemKey) {
      // Sem isto, um `{}` novo a cada run invalidava `useNodeLayouts` e os badges
      // de todos os nós sem nada ter mudado.
      setMetricsByLink((prev) => (Object.keys(prev).length === 0 ? prev : EMPTY_LINK_METRICS));
      setLoading(false);
      setStale(false);
      setFetchedAtMs(undefined);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let lastStartMs = 0;
    let fetchGeneration = 0;

    const applyMetrics = (next: LinkRuntimeMetricsMap) => {
      if (cancelled) {
        return;
      }
      // Cada busca monta objetos novos; sem reaproveitar os iguais, todo link e todo nó
      // redesenhavam a cada ciclo de métricas mesmo com RX/TX parados.
      const shared = structuralShare(next, lastGoodRef.current);
      lastGoodRef.current = shared;
      setMetricsByLink(shared);
      setFetchedAtMs(Date.now());
      setLoading(false);
      setStale(false);
    };

    const applyError = () => {
      if (cancelled) {
        return;
      }
      setMetricsByLink(lastGoodRef.current);
      setLoading(false);
      setStale(Object.keys(lastGoodRef.current).length > 0);
    };

    const fetchMetrics = async (bypassCache = false) => {
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
      setLoading(true);
      setStale(Object.keys(lastGoodRef.current).length > 0);

      try {
        if (bypassCache) {
          metricsCache.invalidate(cacheKey);
        }
        const next = await metricsCache.get(cacheKey, async () => {
          const items = await fetchZabbixItemLastValues(datasourceUid, itemIdsRef.current);
          return buildLinkRuntimeMetricsMap(mapRef.current, items, thresholdsRef.current);
        });
        if (cancelled || generation !== fetchGeneration) {
          return;
        }
        applyMetrics(next);
      } catch {
        if (generation === fetchGeneration) {
          applyError();
        }
      } finally {
        if (generation === fetchGeneration) {
          inFlight = false;
        }
      }
    };

    void fetchMetrics(false);

    const intervalSec =
      refreshSec != null && refreshSec > 0
        ? Math.max(ZABBIX_DIRECT_MIN_REFRESH_SEC, Math.floor(refreshSec))
        : null;
    const timer =
      intervalSec != null ? window.setInterval(() => void fetchMetrics(true), intervalSec * 1000) : undefined;

    const handleVisibility = () => {
      if (!document.hidden) {
        void fetchMetrics(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const refreshSub = eventBus?.getStream(RefreshEvent).subscribe(() => void fetchMetrics(true));

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      refreshSub?.unsubscribe();
    };
  }, [enabled, datasourceUid, itemKey, cacheKey, refreshSec, eventBus]);

  return { metricsByLink, loading, stale, fetchedAtMs };
}
