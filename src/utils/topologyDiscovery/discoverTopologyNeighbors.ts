import { PanelData } from '@grafana/data';
import { HostMetadataMap, TopologyMap, TopologySuggestedLink } from '../../types';
import { buildQueryIndex, interfacesByHostKeysFromIndex } from '../../services/queryIndex';
import { resolveHostLookupKey } from '../hostLookup';
import { isHostNode } from '../topologyNodes';
import { fetchZabbixNeighborItems } from '../zabbixApi';
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
 * Interfaces locais vêm da Query; vizinhança continua via API Zabbix.
 */
export async function discoverTopologyNeighbors(
  datasourceUid: string,
  map: TopologyMap,
  hostMetadata?: HostMetadataMap,
  queryData?: PanelData
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

  const neighborEntries = await fetchZabbixNeighborItems(datasourceUid, hostKeys);
  const queryIndex = buildQueryIndex(queryData);
  const interfacesByHost = interfacesByHostKeysFromIndex(queryIndex, hostKeys, hostMetadata);
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
