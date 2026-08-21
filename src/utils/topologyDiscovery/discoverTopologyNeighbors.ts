import { HostMetadataMap, TopologyMap, TopologySuggestedLink } from '../../types';
import { resolveHostLookupKey } from '../hostLookup';
import { isHostNode } from '../topologyNodes';
import { fetchZabbixHostInterfaceItems, fetchZabbixNeighborItems } from '../zabbixApi';
import { groupInterfacesByHost } from '../zabbixAdapter/parseInterfaceItems';
import { groupNeighborsByHost } from '../zabbixAdapter/parseNeighborItems';
import { correlateNeighborsToSuggestions } from './correlateNeighbors';

export interface NeighborDiscoveryResult {
  suggestions: TopologySuggestedLink[];
  hostsScanned: number;
  neighborRecords: number;
  lldpAvailable: boolean;
  cdpAvailable: boolean;
}

function hostKeysFromMap(map: TopologyMap, hostMetadata?: HostMetadataMap): string[] {
  const keys = new Set<string>();
  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const key = resolveHostLookupKey(node, hostMetadata);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}

/**
 * Descobre vizinhos LLDP/CDP via itens Zabbix dos templates dos hosts.
 * Interfaces locais e vizinhança vêm da API Zabbix.
 */
export async function discoverTopologyNeighbors(
  datasourceUid: string,
  map: TopologyMap,
  hostMetadata?: HostMetadataMap
): Promise<NeighborDiscoveryResult> {
  const hostKeys = hostKeysFromMap(map, hostMetadata);
  if (!datasourceUid || !hostKeys.length) {
    return {
      suggestions: [],
      hostsScanned: 0,
      neighborRecords: 0,
      lldpAvailable: false,
      cdpAvailable: false,
    };
  }

  const [neighborEntries, interfaceEntries] = await Promise.all([
    fetchZabbixNeighborItems(datasourceUid, hostKeys),
    fetchZabbixHostInterfaceItems(datasourceUid, hostKeys),
  ]);
  const interfacesByHost = groupInterfacesByHost(interfaceEntries);
  const neighbors = groupNeighborsByHost(
    neighborEntries.map((e) => ({ hostKey: e.hostKey, hostid: e.hostid, items: e.items }))
  );

  const suggestions = correlateNeighborsToSuggestions({
    map,
    neighbors,
    interfacesByHost,
    hostMetadata,
    existingSuggested: map.suggestedLinks,
  }).filter((s) => s.state === 'suggested');

  return {
    suggestions,
    hostsScanned: hostKeys.length,
    neighborRecords: neighbors.length,
    lldpAvailable: neighbors.some((n) => n.protocol === 'lldp'),
    cdpAvailable: neighbors.some((n) => n.protocol === 'cdp'),
  };
}
