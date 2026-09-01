import { MutableRefObject } from 'react';
import { TopologyStatusValueMapping } from '../types';
import { QueryIndex } from '../services/queryIndex';
import { HostProblemsMap } from '../utils/noc/types';
import { RegionHostStats } from '../utils/networkStats';
import type { ZabbixBackendPollLayout } from '../utils/zabbixBackendLayout';
import { ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';

/**
 * Índice de status do mapa: lastvalue direto do Zabbix, ou resumo do backend Go
 * quando `pollViaBackend` está ligado.
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
  pollViaBackend?: boolean;
  statusValueMappings?: TopologyStatusValueMapping[];
  layoutRef?: MutableRefObject<ZabbixBackendPollLayout | undefined>;
  regionLayoutKey?: string;
}

export interface UseTopologyQueryIndexResult {
  index: QueryIndex;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
  ready: boolean;
  loading: boolean;
  error?: string;
  regionStats?: Map<string, RegionHostStats>;
}

export function useTopologyQueryIndex(options: UseTopologyQueryIndexOptions): UseTopologyQueryIndexResult {
  return useZabbixDirectIndex(options);
}
