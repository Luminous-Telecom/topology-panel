import { useMemo } from 'react';
import { EventBus, LoadingState, PanelData, TimeRange } from '@grafana/data';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { HostHoverSeriesMap } from '../utils/hostTimeSeries';
import { HostProblemsMap } from '../utils/noc/types';
import { StatusColorOptions } from '../utils/statusMapping';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';

/**
 * Índice de status do mapa: snapshot direto Zabbix (API) e, se houver séries no `PanelData`
 * (testes), o índice montado a partir delas.
 */

export interface UseTopologyQueryIndexOptions {
  panelData: PanelData;
  enabled: boolean;
  datasourceUid?: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  eventBus?: EventBus;
  timeRange?: TimeRange;
  statusOptions?: StatusColorOptions;
  trafficItemIds?: string[];
  trafficKeys?: string[];
  signalHostIds?: string[];
  signalSearchTerms?: string[];
  selectSignalItemIds?: (items: ZabbixInterfaceItem[]) => string[];
}

export interface UseTopologyQueryIndexResult {
  index: QueryIndex;
  hoverByHost: HostHoverSeriesMap;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
}

function panelDataIndex(data: PanelData): QueryIndex | undefined {
  if (data.state !== LoadingState.Done && data.state !== LoadingState.Streaming) {
    return undefined;
  }
  if (!data.series?.length) {
    return undefined;
  }
  const index = buildQueryIndex(data);
  return index.refIds.length > 0 || index.hosts.length > 0 ? index : undefined;
}

export function useTopologyQueryIndex({
  panelData,
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
}: UseTopologyQueryIndexOptions): UseTopologyQueryIndexResult {
  const direct = useZabbixDirectIndex({
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
  });

  const fromPanelData = useMemo(() => panelDataIndex(panelData), [panelData]);

  const index = fromPanelData ?? direct.index;

  const ready = Boolean(fromPanelData) || direct.ready;

  const loading =
    !fromPanelData &&
    (direct.loading || panelData.state === LoadingState.Loading);

  const error = fromPanelData ? undefined : direct.error;

  return {
    index,
    hoverByHost: fromPanelData ? {} : direct.hoverByHost,
    lastValues: fromPanelData ? {} : (direct.lastValues ?? {}),
    interfaceItems: fromPanelData ? [] : (direct.interfaceItems ?? []),
    problems: fromPanelData ? {} : direct.problems,
    ready,
    loading,
    error,
  };
}
