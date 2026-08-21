import { describe, expect, it } from 'vitest';
import { HostDisplayInfo } from '../types';
import { enrichHostDisplayFromMap, preferHostDisplayInfo } from './hostLookup';
import { lookupHostDisplay } from './queryHosts';

describe('preferHostDisplayInfo', () => {
  const offline: HostDisplayInfo = { value: 0, status: 'offline', color: '#f00' };
  const online: HostDisplayInfo = { value: 0.0006, status: 'online', color: '#0f0' };

  it('prefere incoming quando não há timestamp', () => {
    expect(preferHostDisplayInfo(offline, online)).toEqual(online);
    expect(preferHostDisplayInfo(online, offline)).toEqual(offline);
  });

  it('prefere entrada com updatedAtSec mais recente', () => {
    const staleOnline: HostDisplayInfo = { ...online, updatedAtSec: 100 };
    const freshOffline: HostDisplayInfo = { ...offline, updatedAtSec: 200 };
    expect(preferHostDisplayInfo(staleOnline, freshOffline)).toEqual(freshOffline);
    expect(preferHostDisplayInfo(freshOffline, staleOnline)).toEqual(freshOffline);
  });
});

describe('lookupHostDisplay', () => {
  it('não fica preso em IP offline quando o nome já voltou online', () => {
    const display = {
      '100.126.32.6': { value: 0, status: 'offline' as const, color: '#f00' },
      'CAM - INTERNO': { value: 0.000663, status: 'online' as const, color: '#0f0' },
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
        '100.126.32.6': { value: 0, status: 'offline', color: '#f00' },
        'CAM - INTERNO': { value: 0.000663, status: 'online', color: '#0f0' },
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
