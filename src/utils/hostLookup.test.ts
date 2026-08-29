import { describe, expect, it } from 'vitest';
import { HostDisplayInfo } from '../types';
import { collectHostMetadataForMaps, enrichHostDisplayFromMap, enrichHostMetadataFromMaps, preferHostDisplayInfo, resolveHostZabbixId } from './hostLookup';
import { lookupHostDisplay } from './queryHosts';
import { emptyMap, hostNode } from './testMapFixtures';

describe('preferHostDisplayInfo', () => {
  const offline: HostDisplayInfo = { value: 0, status: 'offline', color: '#f00' };
  const online: HostDisplayInfo = { value: 0.0006, status: 'online', color: '#0f0' };

  it('sem timestamp, offline (0) vence online stale', () => {
    expect(preferHostDisplayInfo(offline, online)).toEqual(offline);
    expect(preferHostDisplayInfo(online, offline)).toEqual(offline);
  });

  it('prefere entrada com updatedAtSec mais recente', () => {
    const staleOnline: HostDisplayInfo = { ...online, updatedAtSec: 100 };
    const freshOffline: HostDisplayInfo = { ...offline, updatedAtSec: 200 };
    expect(preferHostDisplayInfo(staleOnline, freshOffline)).toEqual(freshOffline);
    expect(preferHostDisplayInfo(freshOffline, staleOnline)).toEqual(freshOffline);
  });

  it('no mesmo timestamp, offline (0) vence online', () => {
    const ts = 200;
    const onlineAtTs: HostDisplayInfo = { ...online, updatedAtSec: ts };
    const offlineAtTs: HostDisplayInfo = { ...offline, updatedAtSec: ts };
    expect(preferHostDisplayInfo(onlineAtTs, offlineAtTs)).toEqual(offlineAtTs);
    expect(preferHostDisplayInfo(offlineAtTs, onlineAtTs)).toEqual(offlineAtTs);
  });
});

describe('lookupHostDisplay', () => {
  it('não fica preso em IP offline quando o nome já voltou online', () => {
    const display = {
      '100.126.32.6': { value: 0, status: 'offline' as const, color: '#f00', updatedAtSec: 100 },
      'CAM - INTERNO': { value: 0.000663, status: 'online' as const, color: '#0f0', updatedAtSec: 200 },
    };
    const info = lookupHostDisplay(
      display,
      { zabbixHost: '100.126.32.6', subtitle: '100.126.32.6', label: 'CAM - INTERNO' },
      {
        '100.126.32.6': { name: 'CAM - INTERNO', ip: '100.126.32.6', hostid: '10860' },
      }
    );
    expect(info?.status).toBe('online');
  });

  it('não fica preso em IP online quando o nome já caiu', () => {
    const display = {
      '100.126.32.6': { value: 0.000663, status: 'online' as const, color: '#0f0', updatedAtSec: 100 },
      'CAM - INTERNO': { value: 0, status: 'offline' as const, color: '#f00', updatedAtSec: 200 },
    };
    const info = lookupHostDisplay(
      display,
      { zabbixHost: '100.126.32.6', subtitle: '100.126.32.6', label: 'CAM - INTERNO' },
      {
        '100.126.32.6': { name: 'CAM - INTERNO', ip: '100.126.32.6', hostid: '10860' },
      }
    );
    expect(info?.status).toBe('offline');
  });
});

describe('enrichHostDisplayFromMap', () => {
  it('atualiza alias por IP mesmo quando já existia entrada stale', () => {
    const map = {
      nodes: [
        {
          id: 'cam-interno',
          type: 'host' as const,
          x: 0,
          y: 0,
          label: 'CAM - INTERNO',
          zabbixHost: '100.126.32.6',
          subtitle: '100.126.32.6',
        },
      ],
      links: [],
      width: 100,
      height: 100,
    };
    const enriched = enrichHostDisplayFromMap(
      {
        '100.126.32.6': { value: 0, status: 'offline', color: '#f00', updatedAtSec: 100 },
        'CAM - INTERNO': { value: 0.000663, status: 'online', color: '#0f0', updatedAtSec: 200 },
      },
      map
    );
    expect(enriched['100.126.32.6']?.status).toBe('online');
  });

  it('propaga queda para IP quando o nome já está offline', () => {
    const map = {
      nodes: [
        {
          id: 'cam-interno',
          type: 'host' as const,
          x: 0,
          y: 0,
          label: 'CAM - INTERNO',
          zabbixHost: '100.126.32.6',
          subtitle: '100.126.32.6',
        },
      ],
      links: [],
      width: 100,
      height: 100,
    };
    const enriched = enrichHostDisplayFromMap(
      {
        '100.126.32.6': { value: 0.000663, status: 'online', color: '#0f0', updatedAtSec: 100 },
        'CAM - INTERNO': { value: 0, status: 'offline', color: '#f00', updatedAtSec: 200 },
      },
      map
    );
    expect(enriched['100.126.32.6']?.status).toBe('offline');
  });
});

describe('collectHostMetadataForMaps', () => {
  it('junta metadata dos hosts do mapa raiz e dos filhos', () => {
    const root = emptyMap({
      nodes: [hostNode({ id: 'h1', zabbixHost: 'host-a' })],
    });
    const child = emptyMap({
      nodes: [hostNode({ id: 'h2', zabbixHost: 'host-b' })],
    });
    const metadata = {
      'host-a': { name: 'host-a', hostid: '1001' },
      'host-b': { name: 'host-b', hostid: '1002' },
      'host-c': { name: 'host-c', hostid: '1003' },
    };
    const subset = collectHostMetadataForMaps([root, child], metadata);
    expect(Object.keys(subset).sort()).toEqual(['host-a', 'host-b']);
    expect(subset['host-a']?.hostid).toBe('1001');
    expect(subset['host-b']?.hostid).toBe('1002');
  });
});

describe('enrichHostMetadataFromMaps', () => {
  it('indexa alias de host do mapa filho mesmo quando o mapa aberto é a raiz', () => {
    const root = emptyMap({
      nodes: [hostNode({ id: 'h1', zabbixHost: 'host-a' })],
    });
    const child = emptyMap({
      nodes: [
        hostNode({
          id: 'h2',
          label: 'host-b',
          zabbixHost: 'CPE-01',
          subtitle: '10.0.0.2',
        }),
      ],
    });
    const metadata = {
      'host-a': { name: 'host-a', hostid: '1001' },
      'host-b': { name: 'host-b', ip: '10.0.0.2', hostid: '1002' },
    };
    const enriched = enrichHostMetadataFromMaps(metadata, [root, child]);
    expect(enriched['CPE-01']?.hostid).toBe('1002');
    expect(enriched['10.0.0.2']?.hostid).toBe('1002');
  });
});

describe('resolveHostZabbixId', () => {
  it('resolve o hostid pelo IP da metadata', () => {
    expect(
      resolveHostZabbixId(
        { zabbixHost: '10.0.0.1', label: 'host-a' },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' } }
      )
    ).toBe('101');
  });

  it('ignora zabbixHostId legado quando a metadata já resolve o host', () => {
    expect(
      resolveHostZabbixId(
        { zabbixHost: '10.0.0.1', label: 'host-a', zabbixHostId: '999' },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' } }
      )
    ).toBe('101');
  });

  it('resolve o hostid pelo label quando a metadata só está no IP', () => {
    expect(
      resolveHostZabbixId(
        { label: 'host-a' },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' } }
      )
    ).toBe('101');
  });

  it('casa o label com o nome visível sem distinguir maiúsculas', () => {
    expect(
      resolveHostZabbixId(
        { label: 'Host-A' },
        { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' } }
      )
    ).toBe('101');
  });
});
