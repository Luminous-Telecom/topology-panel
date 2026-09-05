import { useZabbixDirectIndex, UseZabbixDirectIndexResult } from './useZabbixDirectIndex';
import { ZabbixPollFeed } from '../utils/zabbixPollVolatile';

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

export type UseTopologyQueryIndexResult = UseZabbixDirectIndexResult;

export type { ZabbixPollFeed };

export function useTopologyQueryIndex(options: UseTopologyQueryIndexOptions): UseTopologyQueryIndexResult {
  return useZabbixDirectIndex(options);
}
