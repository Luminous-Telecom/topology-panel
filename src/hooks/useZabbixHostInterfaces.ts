import { PanelData } from '@grafana/data';
import { useMemo } from 'react';
import { HostMetadataMap, TopologyNetworkInterface } from '../types';
import {
  buildQueryIndex,
  interfacesByHostKeysFromIndex,
  queryIndexHasInterfaceItems,
} from '../services/queryIndex';

export interface UseZabbixHostInterfacesResult {
  interfacesByHost: Record<string, TopologyNetworkInterface[]>;
  loading: boolean;
  loadError?: string;
}

/** Inventário de interfaces monitoradas — exclusivamente da aba Query do painel. */
export function useZabbixHostInterfaces(
  hostKeys: string[],
  queryData?: PanelData,
  hostMetadata?: HostMetadataMap
): UseZabbixHostInterfacesResult {
  const keys = useMemo(
    () => [...new Set(hostKeys.map((name) => name.trim()).filter(Boolean))],
    [hostKeys]
  );
  const hostKey = useMemo(() => keys.sort().join('\0'), [keys]);
  const queryIndex = useMemo(() => buildQueryIndex(queryData), [queryData]);
  const interfacesByHost = useMemo(
    () => interfacesByHostKeysFromIndex(queryIndex, keys, hostMetadata),
    [queryIndex, hostKey, hostMetadata]
  );
  const loadError = useMemo(() => {
    if (!hostKey || queryIndexHasInterfaceItems(queryIndex)) {
      return undefined;
    }
    return 'Inclua métricas de interface na aba Query (RX/TX, operstatus ou equivalente).';
  }, [hostKey, queryIndex]);

  return { interfacesByHost, loading: false, loadError };
}
