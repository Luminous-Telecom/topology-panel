import { useMemo } from 'react';
import { HostMetadataMap, TopologyNetworkInterface, TopologyNode } from '../types';
import { collectHostLookupCandidates } from '../utils/hostLookup';
import { pickHostInterfaces } from '../utils/zabbixAdapter/parseInterfaceItems';
import {
  NO_API_ITEMS_ERROR,
  useZabbixHostInterfaces,
  ZabbixInterfaceKeywordOptions,
} from './useZabbixHostInterfaces';

export interface UseLinkPeerInterfacesResult {
  fromInterfaces: TopologyNetworkInterface[];
  toInterfaces: TopologyNetworkInterface[];
  loading: boolean;
  loadError?: string;
}

/**
 * Erro do modal: falha real da API, ou lista vazia nos dois extremos.
 * Um lado sem SNMP (nuvem / link externo) não esconde o seletor do outro.
 */
export function combinePeerInterfaceLoadError(params: {
  fromError?: string;
  toError?: string;
  fromCount: number;
  toCount: number;
  loading: boolean;
  queriedBoth: boolean;
}): string | undefined {
  const fatal = [params.fromError, params.toError].find(Boolean);
  if (fatal) {
    return fatal;
  }
  if (params.loading || !params.queriedBoth) {
    return undefined;
  }
  if (params.fromCount === 0 && params.toCount === 0) {
    return NO_API_ITEMS_ERROR;
  }
  return undefined;
}

/** Inventário de interface de cada extremo do cabo — uma busca por lado. */
export function useLinkPeerInterfaces(
  fromPeer: TopologyNode | undefined,
  toPeer: TopologyNode | undefined,
  datasourceUid: string | undefined,
  keywords: ZabbixInterfaceKeywordOptions,
  hostMetadata?: HostMetadataMap
): UseLinkPeerInterfacesResult {
  const fromKeys = useMemo(
    () => (fromPeer ? collectHostLookupCandidates(fromPeer, hostMetadata) : []),
    [fromPeer, hostMetadata]
  );
  const toKeys = useMemo(
    () => (toPeer ? collectHostLookupCandidates(toPeer, hostMetadata) : []),
    [hostMetadata, toPeer]
  );
  const fromResult = useZabbixHostInterfaces(fromKeys, datasourceUid, keywords, hostMetadata);
  const toResult = useZabbixHostInterfaces(toKeys, datasourceUid, keywords, hostMetadata);
  const fromInterfaces = pickHostInterfaces(fromResult.interfacesByHost, fromKeys);
  const toInterfaces = pickHostInterfaces(toResult.interfacesByHost, toKeys);
  const loading = fromResult.loading || toResult.loading;
  return {
    fromInterfaces,
    toInterfaces,
    loading,
    loadError: combinePeerInterfaceLoadError({
      fromError: fromResult.loadError,
      toError: toResult.loadError,
      fromCount: fromInterfaces.length,
      toCount: toInterfaces.length,
      loading,
      queriedBoth: fromKeys.length > 0 && toKeys.length > 0 && !loading,
    }),
  };
}
