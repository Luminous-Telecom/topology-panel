import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import {
  isLinkVisibleForFilters,
  isNodeVisibleForFilters,
  computeNocMapSummary,
  collectAlertHostEntries,
  collectAlertHostEntriesFromMaps,
  collectNocHostEntries,
} from './topologyFilters';
import { ROOT_MAP_ID } from '../topologyMapNavigation';

describe('topologyFilters', () => {
  const map: TopologyMap = {
    width: 800,
    height: 600,
    nodes: [
      { id: 'olt', type: 'host', icon: 'olt', zabbixHost: '10.0.0.1', x: 0, y: 0 },
      { id: 'core', type: 'host', icon: 'router', zabbixHost: '10.0.0.2', x: 0, y: 0 },
    ],
    links: [{ from: 'core', to: 'olt' }],
  };

  it('filtra OLTs', () => {
    const ctx = { map, options: { linkUtilThresholdHigh: 75 } };
    const olt = map.nodes[0];
    expect(isNodeVisibleForFilters(olt, new Set(['olt']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(map.nodes[1], new Set(['olt']), ctx)).toBe(false);
  });

  it('filtra pontas de cabo congestionado e marca a tag no host', () => {
    const ctx = {
      map,
      linkMetricsByLink: {
        'core-olt': {
          from: { txUtilizationPct: 91 },
          to: {},
          status: 'up' as const,
        },
      },
      options: { linkUtilThresholdHigh: 75 },
    };
    const filters = new Set<'congestedLinks'>(['congestedLinks']);
    expect(isNodeVisibleForFilters(map.nodes[0], filters, ctx)).toBe(true);
    expect(isLinkVisibleForFilters(map.links[0], filters, ctx)).toBe(true);
    expect(computeNocMapSummary(ctx).congestedLinkCount).toBe(1);
    expect(collectNocHostEntries(filters, [{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map }], ctx)[0]?.tags).toContain(
      'Link congestionado'
    );
  });

  it('esconde cabo cuja ponta não casa com o filtro ativo', () => {
    const ctx = { map, options: { linkUtilThresholdHigh: 75 } };
    expect(isLinkVisibleForFilters(map.links[0], new Set(['olt']), ctx)).toBe(false);
    expect(isLinkVisibleForFilters({ from: 'core', to: 'inexistente' }, new Set(['olt']), ctx)).toBe(false);
  });

  it('resume hosts offline e problemas', () => {
    const ctx = {
      map,
      hostDisplay: { '10.0.0.1': { value: 0, status: 'offline' as const } },
      hostProblems: { hostid1: { count: 2, maxSeverity: 4 } },
      hostMetadata: { '10.0.0.1': { name: 'OLT', hostid: 'hostid1' } },
      options: { linkUtilThresholdHigh: 75 },
    };
    const summary = computeNocMapSummary(ctx);
    expect(summary.hostCount).toBe(2);
    expect(summary.offlineCount).toBe(1);
    expect(summary.problemCount).toBe(2);
  });

  it('lista só hosts offline ou em alerta (status da Query)', () => {
    const extendedMap: TopologyMap = {
      ...map,
      nodes: [
        ...map.nodes,
        { id: 'sw', type: 'host', icon: 'switch_managed', zabbixHost: '10.0.0.3', x: 0, y: 0 },
      ],
    };
    const ctx = {
      map: extendedMap,
      hostDisplay: {
        '10.0.0.1': { value: 0, status: 'offline' as const },
        '10.0.0.2': { value: 2, status: 'alert' as const },
        '10.0.0.3': { value: 1, status: 'online' as const },
      },
      hostProblems: {
        hostid1: { count: 2, maxSeverity: 4 },
        hostid3: { count: 1, maxSeverity: 3 },
      },
      hostMetadata: {
        '10.0.0.1': { name: 'OLT', hostid: 'hostid1' },
        '10.0.0.3': { name: 'SW-01', hostid: 'hostid3' },
      },
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectAlertHostEntries(ctx);
    expect(entries.map((entry) => entry.nodeId)).toEqual(['olt', 'core']);
    expect(entries[0]?.reason).toBe('offline');
    expect(entries[1]?.reason).toBe('alert');
  });

  it('remove host da lista quando o status normaliza para online', () => {
    const ctx = {
      map,
      hostDisplay: {
        '10.0.0.2': { value: 1, status: 'online' as const },
      },
      hostProblems: { hostid2: { count: 3, maxSeverity: 4 } },
      hostMetadata: { '10.0.0.2': { name: 'Core', hostid: 'hostid2' } },
      options: { linkUtilThresholdHigh: 75 },
    };
    expect(collectAlertHostEntries(ctx)).toEqual([]);
  });

  it('lista de alertas agrega hosts offline de mapa filho fora do mapa aberto', () => {
    const child: TopologyMap = {
      width: 800,
      height: 600,
      nodes: [{ id: 'sw1', type: 'host', icon: 'switch_managed', zabbixHost: '10.0.0.9', x: 0, y: 0 }],
      links: [],
    };
    const ctx = {
      hostDisplay: { '10.0.0.9': { value: 0, status: 'offline' as const } },
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectAlertHostEntriesFromMaps(
      [
        { mapId: ROOT_MAP_ID, mapLabel: 'Início', map },
        { mapId: 'apodi', mapLabel: 'Apodi', map: child },
      ],
      ctx
    );
    expect(entries.map((e) => `${e.mapId}:${e.nodeId}`)).toEqual(['apodi:sw1']);
    expect(entries[0]?.reason).toBe('offline');
  });

  it('modo NOC agrega hosts de mapa raiz e filhos', () => {
    const child: TopologyMap = {
      width: 800,
      height: 600,
      nodes: [{ id: 'sw1', type: 'host', icon: 'switch_managed', zabbixHost: '10.0.0.9', x: 0, y: 0 }],
      links: [],
    };
    const ctx = {
      hostDisplay: { '10.0.0.9': { value: 0, status: 'offline' as const } },
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectNocHostEntries(new Set(['offline']), [
      { mapId: ROOT_MAP_ID, mapLabel: 'Início', map },
      { mapId: 'apodi', mapLabel: 'Apodi', map: child },
    ], ctx);
    expect(entries.map((e) => `${e.mapId}:${e.nodeId}`)).toEqual(['apodi:sw1']);
  });

  it('modo NOC detecta offline em mapa filho via IP do nó (fora do mapa aberto)', () => {
    const child: TopologyMap = {
      width: 800,
      height: 600,
      nodes: [
        {
          id: 'sw1',
          type: 'host',
          icon: 'switch_managed',
          zabbixHost: 'switch-apodi',
          subtitle: '10.0.0.9',
          x: 0,
          y: 0,
        },
      ],
      links: [],
    };
    const ctx = {
      hostDisplay: { 'switch-apodi': { value: 0, status: 'offline' as const } },
      hostMetadata: { 'switch-apodi': { name: 'switch-apodi', ip: '10.0.0.9' } },
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectNocHostEntries(new Set(['offline']), [
      { mapId: ROOT_MAP_ID, mapLabel: 'Início', map },
      { mapId: 'apodi', mapLabel: 'Apodi', map: child },
    ], ctx);
    expect(entries.map((e) => `${e.mapId}:${e.nodeId}`)).toEqual(['apodi:sw1']);
  });

  it('modo NOC sem filtro lista todos os hosts', () => {
    const ctx = {
      hostDisplay: {},
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectNocHostEntries(new Set(), [{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map }], ctx);
    expect(entries).toHaveLength(2);
  });
});
