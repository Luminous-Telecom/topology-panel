import { useMemo } from 'react';
import { HostMetadataMap, TopologyNetworkInterface, TopologyNode } from '../types';
import { collectHostLookupCandidates } from '../utils/hostLookup';
import { pickHostInterfaces } from '../utils/zabbixAdapter/parseInterfaceItems';
import { useZabbixHostInterfaces, ZabbixInterfaceKeywordOptions } from './useZabbixHostInterfaces';

export interface UseLinkPeerInterfacesResult {
  fromInterfaces: TopologyNetworkInterface[];
  toInterfaces: TopologyNetworkInterface[];
  loading: boolean;
  loadError?: string;
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
  return {
    fromInterfaces: pickHostInterfaces(fromResult.interfacesByHost, fromKeys),
    toInterfaces: pickHostInterfaces(toResult.interfacesByHost, toKeys),
    loading: fromResult.loading || toResult.loading,
    loadError: fromResult.loadError ?? toResult.loadError,
  };
}
