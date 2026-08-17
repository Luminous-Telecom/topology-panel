import { describe, expect, it } from 'vitest';
import { parseNeighborItemKey } from './zabbixAdapter/neighborItemKeys';
import { parseZabbixNeighborItems } from './zabbixAdapter/parseNeighborItems';
import { correlateNeighborsToSuggestions } from './topologyDiscovery/correlateNeighbors';
import { emptyMap, hostNode } from './testMapFixtures';

describe('neighborItemKeys', () => {
  it('classifica item LLDP de sysname', () => {
    const parsed = parseNeighborItemKey('lldp.rem.sysname[10,2]', 'LLDP remote system name');
    expect(parsed?.protocol).toBe('lldp');
    expect(parsed?.kind).toBe('remoteSysName');
  });

  it('classifica item CDP', () => {
    const parsed = parseNeighborItemKey('cdpCacheDevicePort[22]', 'CDP cache device port');
    expect(parsed?.protocol).toBe('cdp');
    expect(parsed?.kind).toBe('remotePort');
  });
});

describe('parseZabbixNeighborItems', () => {
  it('agrupa sysname e porta remota', () => {
    const records = parseZabbixNeighborItems('10.0.0.1', '1', [
      { itemid: '1', key_: 'lldp.rem.sysname[10,2]', lastvalue: 'SW-CORE', hostid: '1' },
      { itemid: '2', key_: 'lldp.rem.portid[10,2]', lastvalue: 'ether1', hostid: '1' },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].remoteSysName).toBe('SW-CORE');
    expect(records[0].remotePort).toBe('ether1');
  });
});

describe('correlateNeighborsToSuggestions', () => {
  it('sugere link entre hosts do mapa pelo sysname remoto', () => {
    const map = emptyMap({
      nodes: [
        hostNode({ id: 'a', label: 'SW-A', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'b', label: 'SW-B', zabbixHost: '10.0.0.2' }),
      ],
    });
    const suggestions = correlateNeighborsToSuggestions({
      map,
      neighbors: [
        {
          hostKey: '10.0.0.1',
          protocol: 'lldp',
          localInterface: 'sfp1',
          remoteSysName: 'SW-B',
          remotePort: 'ether1',
        },
      ],
      interfacesByHost: {},
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].fromNodeId).toBe('a');
    expect(suggestions[0].toNodeId).toBe('b');
    expect(suggestions[0].state).toBe('suggested');
  });
});
