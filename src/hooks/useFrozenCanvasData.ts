import { MutableRefObject, useMemo } from 'react';
import { PanelData } from '@grafana/data';
import { HostDisplayMap, HostMetadataMap, TopologyMap } from '../types';
import { useDeferredDuringGesture } from './useDeferredDuringGesture';

export interface CanvasData {
  map: TopologyMap;
  hostDisplay?: HostDisplayMap;
  hostDisplayByRefId: Record<string, HostDisplayMap>;
  queryReady?: boolean;
  queryError?: boolean;
  hostMetadata?: HostMetadataMap;
  submapHosts: Record<string, string[] | null | undefined>;
  queryData?: PanelData;
}

/**
 * Dados do painel congelados enquanto há gesto em andamento.
 *
 * Sem isso, um auto-refresh do dashboard no meio de um arraste trocaria cores, hosts e posições
 * debaixo da mão do usuário. O `flush` devolvido é chamado ao soltar o ponteiro.
 */
export function useFrozenCanvasData(
  live: CanvasData,
  isGestureActiveRef: MutableRefObject<boolean>
): [CanvasData, () => void] {
  const {
    map,
    hostDisplay,
    hostDisplayByRefId,
    queryReady,
    queryError,
    hostMetadata,
    submapHosts,
    queryData,
  } = live;

  const snapshot = useMemo(
    () => ({
      map,
      hostDisplay,
      hostDisplayByRefId,
      queryReady,
      queryError,
      hostMetadata,
      submapHosts,
      queryData,
    }),
    [
      map,
      hostDisplay,
      hostDisplayByRefId,
      queryReady,
      queryError,
      hostMetadata,
      submapHosts,
      queryData,
    ]
  );

  return useDeferredDuringGesture(snapshot, isGestureActiveRef);
}
