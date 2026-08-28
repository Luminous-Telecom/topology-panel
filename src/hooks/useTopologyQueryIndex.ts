import { EventBus, TimeRange } from '@grafana/data';
import { QueryIndex } from '../services/queryIndex';
import { HostHoverSeriesMap } from '../utils/hostTimeSeries';
import { HostProblemsMap } from '../utils/noc/types';
import { StatusColorOptions } from '../utils/statusMapping';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';

/**
 * Índice de status do mapa: só o snapshot direto do Zabbix.
 *
 * O painel declara `skipDataQuery` — não há `data.series` em produção. Testes mockam este hook
 * (ou `useZabbixDirectIndex`) em vez de fabricar frames da aba Query.
 */

export interface UseTopologyQueryIndexOptions {
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

export function useTopologyQueryIndex({
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
  return useZabbixDirectIndex({
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
}
