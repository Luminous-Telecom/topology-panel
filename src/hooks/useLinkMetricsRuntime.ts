import { useMemo, useRef } from 'react';
import { HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions } from '../types';
import { buildLinkRuntimeMetricsMap, utilizationThresholdsFromOptions } from '../utils/linkMetricsRuntime';
import { structuralShare } from '../utils/structuralIdentity';
import { panelInterfaceKeywords } from './useZabbixHostInterfaces';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';

/** Identidade única para "sem métrica" — um `{}` novo a cada render invalidava layouts e badges. */
const EMPTY_LINK_METRICS: LinkRuntimeMetricsMap = {};
const EMPTY_LAST_VALUES: Record<string, ZabbixItemLastValue> = {};

export interface UseLinkMetricsRuntimeResult {
  metricsByLink: LinkRuntimeMetricsMap;
}

/**
 * Métricas voláteis de links (RX/TX/utilização/status/sinal) — não persistidas no JSON.
 * Os lastvalues vêm do poll (`item.get` em paralelo com o status); este hook só monta o mapa do cabo.
 */
export function useLinkMetricsRuntime(
  map: TopologyMap,
  options: TopologyPanelOptions,
  lastValues: Record<string, ZabbixItemLastValue>,
  hostMetadata?: HostMetadataMap,
  interfaceItems: ZabbixInterfaceItem[] = []
): UseLinkMetricsRuntimeResult {
  const thresholds = useMemo(() => utilizationThresholdsFromOptions(options), [
    options.linkUtilThresholdAttention,
    options.linkUtilThresholdHigh,
    options.linkUtilThresholdCritical,
  ]);
  const keyParseOptions = useMemo(() => panelInterfaceKeywords(options), [
    options.zabbixRxItemKeyword,
    options.zabbixTxItemKeyword,
    options.zabbixOperStatusItemKeyword,
    options.zabbixSpeedItemKeyword,
    options.zabbixRxPowerItemKeyword,
    options.zabbixTxPowerItemKeyword,
  ]);
  const lastGoodRef = useRef<LinkRuntimeMetricsMap>(EMPTY_LINK_METRICS);

  const metricsByLink = useMemo(() => {
    const values = lastValues ?? EMPTY_LAST_VALUES;
    const polledItems = interfaceItems ?? [];
    const next =
      Object.keys(values).length || polledItems.length
        ? buildLinkRuntimeMetricsMap(map, values, thresholds, hostMetadata, polledItems, keyParseOptions)
        : EMPTY_LINK_METRICS;
    const shared = structuralShare(next, lastGoodRef.current);
    lastGoodRef.current = shared;
    return shared;
  }, [map, lastValues, thresholds, hostMetadata, interfaceItems, keyParseOptions]);

  return { metricsByLink };
}
