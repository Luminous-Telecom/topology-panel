import { QueryIndex } from '../services/queryIndex';
import { HostProblemsMap } from '../utils/noc/types';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';

/**
 * Índice de status do mapa: lastvalue direto do Zabbix.
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
  trafficItemIds?: string[];
  trafficKeys?: string[];
}

export interface UseTopologyQueryIndexResult {
  index: QueryIndex;
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
  trafficItemIds,
  trafficKeys,
}: UseTopologyQueryIndexOptions): UseTopologyQueryIndexResult {
  return useZabbixDirectIndex({
    enabled,
    datasourceUid,
    groupNames,
    statusItemKey,
    refreshSec,
    trafficItemIds,
    trafficKeys,
  });
}
