import { useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions } from '../types';
import { createAsyncCache } from '../services/asyncCache';
import {
  buildLinkRuntimeMetricsMap,
  collectLinkMetricItemIds,
  utilizationThresholdsFromOptions,
} from '../utils/linkMetricsRuntime';
import { fetchZabbixItemLastValues } from '../utils/zabbixApi';

const LINK_METRICS_TTL_MS = 5_000;
const MIN_FETCH_GAP_MS = 2_000;

const metricsCache = createAsyncCache<LinkRuntimeMetricsMap>({
  ttlMs: LINK_METRICS_TTL_MS,
});

export interface UseLinkMetricsRuntimeResult {
  metricsByLink: LinkRuntimeMetricsMap;
  loading: boolean;
  stale: boolean;
}

export interface UseLinkMetricsRuntimeOptions {
  /** Intervalo periódico em segundos; `null` = só manual / refresh do dashboard. */
  refreshSec?: number | null;
  eventBus?: EventBus;
  /** Muda a cada refresh da Query — dispara nova busca. */
  queryRefreshKey?: unknown;
}

/**
 * Métricas voláteis de links (RX/TX/utilização/status) — não persistidas no JSON.
 * Atualiza em lote via item.get, com polling configurável e dedupe curto (5s).
 */
export function useLinkMetricsRuntime(
  datasourceUid: string | undefined,
  map: TopologyMap,
  options: TopologyPanelOptions,
  enabled = true,
  runtimeOptions: UseLinkMetricsRuntimeOptions = {}
): UseLinkMetricsRuntimeResult {
  const { refreshSec = null, eventBus, queryRefreshKey } = runtimeOptions;
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
      setMetricsByLink({});
      setLoading(false);
      setStale(false);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let lastStartMs = 0;

    const applyMetrics = (next: LinkRuntimeMetricsMap) => {
      if (cancelled) {
        return;
      }
      lastGoodRef.current = next;
      setMetricsByLink(next);
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
      if (cancelled || inFlight || document.hidden || Date.now() - lastStartMs < MIN_FETCH_GAP_MS) {
        return;
      }
      lastStartMs = Date.now();
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
        applyMetrics(next);
      } catch {
        applyError();
      } finally {
        inFlight = false;
      }
    };

    void fetchMetrics();

    const intervalSec = refreshSec != null && refreshSec > 0 ? Math.floor(refreshSec) : null;
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
  }, [enabled, datasourceUid, itemKey, cacheKey, refreshSec, eventBus, queryRefreshKey]);

  return { metricsByLink, loading, stale };
}
