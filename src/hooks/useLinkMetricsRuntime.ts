import { useMemo, useRef } from 'react';
import { HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions } from '../types';
import { buildLinkRuntimeMetricsMap, utilizationThresholdsFromOptions } from '../utils/linkMetricsRuntime';
import { structuralShare } from '../utils/structuralIdentity';
import { ZabbixItemLastValue } from '../utils/zabbixApi';

/** Identidade única para "sem métrica" — um `{}` novo a cada render invalidava layouts e badges. */
const EMPTY_LINK_METRICS: LinkRuntimeMetricsMap = {};
const EMPTY_LAST_VALUES: Record<string, ZabbixItemLastValue> = {};

export interface UseLinkMetricsRuntimeResult {
  metricsByLink: LinkRuntimeMetricsMap;
}

/**
 * Métricas voláteis de links (RX/TX/utilização/status) — não persistidas no JSON.
 * Os lastvalues vêm do poll (último ponto da série em paralelo com o status); este hook só monta o mapa do cabo.
 */
export function useLinkMetricsRuntime(
  map: TopologyMap,
  options: TopologyPanelOptions,
  lastValues: Record<string, ZabbixItemLastValue>,
  hostMetadata?: HostMetadataMap
): UseLinkMetricsRuntimeResult {
  const thresholds = useMemo(() => utilizationThresholdsFromOptions(options), [
    options.linkUtilThresholdAttention,
    options.linkUtilThresholdHigh,
    options.linkUtilThresholdCritical,
  ]);
  const lastGoodRef = useRef<LinkRuntimeMetricsMap>(EMPTY_LINK_METRICS);

  const metricsByLink = useMemo(() => {
    const values = lastValues ?? EMPTY_LAST_VALUES;
    const next = Object.keys(values).length
      ? buildLinkRuntimeMetricsMap(map, values, thresholds, hostMetadata)
      : EMPTY_LINK_METRICS;
    const shared = structuralShare(next, lastGoodRef.current);
    lastGoodRef.current = shared;
    return shared;
  }, [map, lastValues, thresholds, hostMetadata]);

  return { metricsByLink };
}
