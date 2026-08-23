import { useMemo } from 'react';
import { EventBus, LoadingState, PanelData } from '@grafana/data';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';

/**
 * Índice de status do mapa: usa snapshot direto Zabbix (rápido, último valor) e aceita
 * `PanelData` do Grafana quando houver séries (ex.: testes ou painel com Query no futuro).
 */

export interface UseTopologyQueryIndexOptions {
  panelData: PanelData;
  enabled: boolean;
  datasourceUid?: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  eventBus?: EventBus;
}

export interface UseTopologyQueryIndexResult {
  index: QueryIndex;
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
}: UseTopologyQueryIndexOptions): UseTopologyQueryIndexResult {
  const direct = useZabbixDirectIndex({
    enabled,
    datasourceUid,
    groupNames,
    statusItemKey,
    refreshSec,
    eventBus,
  });

  const fromPanelData = useMemo(() => panelDataIndex(panelData), [panelData]);

  const index = fromPanelData ?? direct.index;

  const ready = Boolean(fromPanelData) || direct.ready;

  const loading =
    !fromPanelData &&
    (direct.loading || panelData.state === LoadingState.Loading);

  const error = fromPanelData ? undefined : direct.error;

  return { index, ready, loading, error };
}
