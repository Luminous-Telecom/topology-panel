import { describe, expect, it } from 'vitest';
import { RegionHostStats, buildRegionStatsMap, formatRegionStats, regionFillColor } from './networkStats';
import { defaultOptions } from '../types';
import { computeNodeLayout } from './nodeLayout';
import { TopologyNode } from '../types';

describe('formatRegionStats — submapa', () => {
  it('mostra parado/alerta/online quando há hosts', () => {
    const text = formatRegionStats(
      { total: 5, offline: 1, alert: 2, online: 2, unknown: 0 },
      true,
      'submap'
    );
    expect(text).toBe('1 / 2 / 2');
  });

  it('mostra Carregando enquanto hosts do submapa não foram resolvidos', () => {
    const text = formatRegionStats(
      { total: 0, offline: 0, alert: 0, online: 0, unknown: 0, loadPending: true },
      true,
      'submap'
    );
    expect(text).toBe('Carregando…');
  });
});

describe('regionFillColor — submapa', () => {
  const options = defaultOptions();

  it('usa colorAlert quando há hosts em alerta no submapa', () => {
    const fill = regionFillColor(
      { total: 5, offline: 0, alert: 2, online: 3, unknown: 0 },
      options,
      'submap',
      true
    );
    expect(fill).toBe(options.colorAlert);
  });

  it('offline tem precedência sobre alerta', () => {
    const fill = regionFillColor(
      { total: 5, offline: 1, alert: 2, online: 2, unknown: 0 },
      options,
      'submap',
      true
    );
    expect(fill).toBe(options.colorOffline);
  });
});

describe('buildRegionStatsMap — submapa com mapa interno', () => {
  it('agrega status dos hosts do childMaps (alerta só via Query)', () => {
    const nodes: TopologyNode[] = [
      {
        id: 'sm1',
        type: 'submap',
        label: 'SEPS',
        x: 0,
        y: 0,
        submapChildMapId: 'seps',
      },
    ];
    const childMaps = {
      seps: {
        width: 800,
        height: 600,
        nodes: [
          { id: 'h1', type: 'host' as const, zabbixHost: '10.0.0.1', x: 0, y: 0 },
          { id: 'h2', type: 'host' as const, zabbixHost: '10.0.0.2', x: 0, y: 0 },
        ],
        links: [],
      },
    };
    const hostDisplay = {
      '10.0.0.1': { value: 1, status: 'online' as const },
      '10.0.0.2': { value: 1, status: 'online' as const },
    };
    const hostMetadata = {
      '10.0.0.1': { name: 'h1', hostid: 'hid1' },
      '10.0.0.2': { name: 'h2', hostid: 'hid2' },
    };
    const stats = buildRegionStatsMap(
      nodes,
      new Map(),
      hostDisplay,
      {},
      hostMetadata,
      {},
      childMaps
    );
    expect(stats.get('sm1')).toEqual({
      total: 2,
      offline: 0,
      alert: 0,
      online: 2,
      unknown: 0,
    });
  });
});

describe('buildRegionStatsMap — submapa', () => {
  it('marca loadPending quando a lista de hosts ainda não chegou', () => {
    const nodes: TopologyNode[] = [
      { id: 'sm1', type: 'submap', label: 'Filial', x: 0, y: 0, submapUid: 'abc' },
    ];
    const stats = buildRegionStatsMap(nodes, new Map(), {}, {});
    expect(stats.get('sm1')?.loadPending).toBe(true);
  });
});

describe('computeNodeLayout — submapa com stats', () => {
  it('expande altura fixa pequena para caber a linha de contagem', () => {
    const layout = computeNodeLayout(
      {
        id: 'sm1',
        type: 'submap',
        label: 'Filial',
        subtitle: '2 / 0 / 5',
        width: 120,
        height: 28,
      },
      { nodeFontSize: 12, showSubtitle: true }
    );
    expect(layout.h).toBeGreaterThanOrEqual(44);
    expect(layout.subY).toBeDefined();
  });
});
