import { useEffect, useMemo, useRef, useState } from 'react';
import { LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions } from '../types';
import { createAsyncCache } from '../services/asyncCache';
import {
  buildLinkRuntimeMetricsMap,
  collectLinkMetricItemIds,
  utilizationThresholdsFromOptions,
} from '../utils/linkMetricsRuntime';
import { fetchZabbixItemLastValues } from '../utils/zabbixApi';

const LINK_METRICS_TTL_MS = 5_000;

const metricsCache = createAsyncCache<LinkRuntimeMetricsMap>({
  ttlMs: LINK_METRICS_TTL_MS,
});

export interface UseLinkMetricsRuntimeResult {
  metricsByLink: LinkRuntimeMetricsMap;
  loading: boolean;
  stale: boolean;
}

/**
 * Métricas voláteis de links (RX/TX/utilização/status) — não persistidas no JSON.
 * Atualiza em lote via item.get; TTL curto (5s) alinhado ao tráfego.
 */
export function useLinkMetricsRuntime(
  datasourceUid: string | undefined,
  map: TopologyMap,
  options: TopologyPanelOptions,
  enabled = true
): UseLinkMetricsRuntimeResult {
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

  useEffect(() => {
    if (!enabled || !datasourceUid || !itemKey) {
      setMetricsByLink({});
      setLoading(false);
      setStale(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setStale(Object.keys(lastGoodRef.current).length > 0);

    void metricsCache
      .get(`${datasourceUid}\u0000linkmetrics\u0000${itemKey}`, async () => {
        const items = await fetchZabbixItemLastValues(datasourceUid, itemIdsRef.current);
        return buildLinkRuntimeMetricsMap(mapRef.current, items, thresholdsRef.current);
      })
      .then((next) => {
        if (!cancelled) {
          lastGoodRef.current = next;
          setMetricsByLink(next);
          setLoading(false);
          setStale(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMetricsByLink(lastGoodRef.current);
          setLoading(false);
          setStale(Object.keys(lastGoodRef.current).length > 0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasourceUid, itemKey, enabled]);

  return { metricsByLink, loading, stale };
}
