import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HostMetadataMap, LinkRuntimeMetricsMap, TopologyMap, TopologyPanelOptions } from '../types';
import {
  buildLinkRuntimeMetricsMap,
  refreshLinkTrafficBpsInMap,
  shareLinkPaintMetrics,
  utilizationThresholdsFromOptions,
} from '../utils/linkMetricsRuntime';
import { scheduleAfterPaint, scheduleWhenIdle } from '../utils/scheduleAfterPaint';
import { sameStructure, structuralShare } from '../utils/structuralIdentity';
import { ZabbixPollFeed } from '../utils/zabbixPollVolatile';
import { panelInterfaceKeywords } from './useZabbixHostInterfaces';
import { LinkMetricsLiveStore } from './linkMetricsLiveStore';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';

/** Identidade única para "sem métrica" — um `{}` novo a cada render invalidava layouts e badges. */
const EMPTY_LINK_METRICS: LinkRuntimeMetricsMap = {};
const EMPTY_LAST_VALUES: Record<string, ZabbixItemLastValue> = {};
const EMPTY_INTERFACE_ITEMS: ZabbixInterfaceItem[] = [];

export interface UseLinkMetricsRuntimeResult {
  metricsByLink: LinkRuntimeMetricsMap;
  /** Métricas estáveis para path/cor/animação — ignora bps que só muda a pílula. */
  paintMetricsByLink: LinkRuntimeMetricsMap;
}

interface FullBuildDeps {
  map: TopologyMap;
  hostMetadata?: HostMetadataMap;
  thresholds: ReturnType<typeof utilizationThresholdsFromOptions>;
  keyParseOptions: ReturnType<typeof panelInterfaceKeywords>;
  interfaceItems: ZabbixInterfaceItem[];
}

function hostMetadataUnchanged(
  prev: HostMetadataMap | undefined,
  next: HostMetadataMap | undefined
): boolean {
  if (prev === next) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }
  return sameStructure(prev, next);
}

function needsFullMetricsBuild(prev: FullBuildDeps | undefined, next: FullBuildDeps): boolean {
  if (!prev) {
    return true;
  }
  // interfaceItems muda a cada poll de tráfego — não invalida o mapa já montado;
  // refreshLinkTrafficBpsInMap lê só lastValues. Build completo volta se o patch falhar.
  return (
    prev.map !== next.map ||
    !hostMetadataUnchanged(prev.hostMetadata, next.hostMetadata) ||
    prev.thresholds !== next.thresholds ||
    prev.keyParseOptions !== next.keyParseOptions
  );
}

function recomputeLinkMetrics(
  map: TopologyMap,
  lastValues: Record<string, ZabbixItemLastValue>,
  interfaceItems: ZabbixInterfaceItem[],
  thresholds: ReturnType<typeof utilizationThresholdsFromOptions>,
  hostMetadata: HostMetadataMap | undefined,
  keyParseOptions: ReturnType<typeof panelInterfaceKeywords>,
  lastLiveRef: { current: LinkRuntimeMetricsMap },
  lastPaintRef: { current: LinkRuntimeMetricsMap },
  lastFullBuildDepsRef: { current: FullBuildDeps | undefined }
): { live: LinkRuntimeMetricsMap; paint: LinkRuntimeMetricsMap; paintChanged: boolean; unchanged: boolean } {
  const values = lastValues ?? EMPTY_LAST_VALUES;
  const polledItems = interfaceItems ?? EMPTY_INTERFACE_ITEMS;
  const buildDeps: FullBuildDeps = {
    map,
    hostMetadata,
    thresholds,
    keyParseOptions,
    interfaceItems: polledItems,
  };
  const fullBuild = needsFullMetricsBuild(lastFullBuildDepsRef.current, buildDeps);
  let next: LinkRuntimeMetricsMap;

  if (!Object.keys(values).length && !polledItems.length) {
    next = EMPTY_LINK_METRICS;
  } else if (fullBuild) {
    next = buildLinkRuntimeMetricsMap(map, values, thresholds, hostMetadata, polledItems, keyParseOptions);
    lastFullBuildDepsRef.current = buildDeps;
  } else {
    const patched = refreshLinkTrafficBpsInMap(map, lastLiveRef.current, values, thresholds, hostMetadata);
    if (patched !== undefined) {
      next = patched;
    } else {
      next = buildLinkRuntimeMetricsMap(map, values, thresholds, hostMetadata, polledItems, keyParseOptions);
      lastFullBuildDepsRef.current = buildDeps;
    }
  }

  const live = structuralShare(next, lastLiveRef.current);
  if (live === lastLiveRef.current) {
    return { live, paint: lastPaintRef.current, paintChanged: false, unchanged: true };
  }
  lastLiveRef.current = live;
  const paint = shareLinkPaintMetrics(live, lastPaintRef.current, thresholds);
  const paintChanged = paint !== lastPaintRef.current;
  lastPaintRef.current = paint;
  return { live, paint, paintChanged, unchanged: false };
}

/**
 * Métricas voláteis de links — assina o feed do poll Zabbix sem depender de re-render do painel.
 */
export function useLinkMetricsRuntime(
  map: TopologyMap,
  options: TopologyPanelOptions,
  pollFeed: ZabbixPollFeed | undefined,
  hostMetadata?: HostMetadataMap,
  liveStore?: LinkMetricsLiveStore
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
  const lastLiveRef = useRef<LinkRuntimeMetricsMap>(EMPTY_LINK_METRICS);
  const lastPaintRef = useRef<LinkRuntimeMetricsMap>(EMPTY_LINK_METRICS);
  const lastFullBuildDepsRef = useRef<FullBuildDeps>();
  const [paintMetricsByLink, setPaintMetricsByLink] = useState<LinkRuntimeMetricsMap>(EMPTY_LINK_METRICS);

  useLayoutEffect(() => {
    let cancelIdle: (() => void) | undefined;
    let cancelPaint: (() => void) | undefined;
    let mounted = true;

    const apply = () => {
      const snapshot = pollFeed?.getSnapshot() ?? {
        lastValues: EMPTY_LAST_VALUES,
        interfaceItems: EMPTY_INTERFACE_ITEMS,
      };
      const { live, paint, paintChanged, unchanged } = recomputeLinkMetrics(
        map,
        snapshot.lastValues,
        snapshot.interfaceItems,
        thresholds,
        hostMetadata,
        keyParseOptions,
        lastLiveRef,
        lastPaintRef,
        lastFullBuildDepsRef
      );
      if (unchanged) {
        return;
      }
      liveStore?.publish(live, paint);
      if (paintChanged) {
        setPaintMetricsByLink(paint);
      }
    };

    const scheduleApply = () => {
      cancelIdle?.();
      cancelIdle = scheduleWhenIdle(() => {
        cancelIdle = undefined;
        if (mounted) {
          apply();
        }
      }, 32);
    };

    cancelPaint = scheduleAfterPaint(() => {
      cancelPaint = undefined;
      if (mounted) {
        apply();
      }
    });
    if (pollFeed) {
      const unsubscribe = pollFeed.subscribe(scheduleApply);
      return () => {
        mounted = false;
        cancelPaint?.();
        cancelIdle?.();
        unsubscribe();
      };
    }
    return () => {
      mounted = false;
      cancelPaint?.();
      cancelIdle?.();
    };
  }, [map, thresholds, hostMetadata, keyParseOptions, pollFeed, liveStore]);

  return { metricsByLink: lastLiveRef.current, paintMetricsByLink };
}
