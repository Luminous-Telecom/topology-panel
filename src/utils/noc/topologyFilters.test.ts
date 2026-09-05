import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import {
  isLinkVisibleForFilters,
  isNodeVisibleForFilters,
  computeNocMapSummary,
  collectAlertHostEntries,
  collectAlertHostEntriesFromMaps,
  collectNocHostEntries,
  collectPresentHostTypeFilterIds,
  collectPresentSubmapFilterIds,
  retainPresentNocTypeFilters,
  visibleNocFilterIds,
  resolveHostProblemSummary,
  alertListHoverText,
  alertListStatusLabel,
  alertListStatusLines,
  visibleHostProblemNames,
} from './topologyFilters';
import { ROOT_MAP_ID } from '../topologyMapNavigation';
import { nocSubmapFilterId } from './types';
import { linkKey } from '../mapLinkEdits';
import { hostNode, emptyMap } from '../testMapFixtures';

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

  it('filtra câmeras, firewalls e servidores pelo ícone ou template', () => {
    const typedMap = emptyMap({
      nodes: [
        hostNode({ id: 'cam', icon: 'camera', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'fw', icon: 'firewall', zabbixHost: '10.0.0.2' }),
        hostNode({ id: 'srv', nodeTemplateId: 'server', zabbixHost: '10.0.0.3' }),
        hostNode({ id: 'ap', icon: 'access_point', zabbixHost: '10.0.0.4' }),
      ],
    });
    const ctx = { map: typedMap, options: { linkUtilThresholdHigh: 75 } };
    expect(isNodeVisibleForFilters(typedMap.nodes[0], new Set(['camera']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(typedMap.nodes[1], new Set(['camera']), ctx)).toBe(false);
    expect(isNodeVisibleForFilters(typedMap.nodes[1], new Set(['firewall']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(typedMap.nodes[2], new Set(['server']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(typedMap.nodes[3], new Set(['access_point']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(typedMap.nodes[0], new Set(['firewall']), ctx)).toBe(false);
  });

  it('marca tags de tipo no modo NOC para câmera e firewall', () => {
    const typedMap = emptyMap({
      nodes: [
        hostNode({ id: 'cam', icon: 'camera', label: 'cam-a', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'fw', icon: 'firewall', label: 'fw-a', zabbixHost: '10.0.0.2' }),
      ],
    });
    const ctx = {
      hostDisplay: {},
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectNocHostEntries(new Set(), [{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map: typedMap }], ctx);
    expect(entries.find((e) => e.nodeId === 'cam')?.tags).toContain('Câmera');
    expect(entries.find((e) => e.nodeId === 'fw')?.tags).toContain('Firewall');
  });

  it('lista só tipos de equipamento que têm host na árvore do painel', () => {
    const root = emptyMap({
      nodes: [
        hostNode({ id: 'cam', icon: 'camera', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'plain', zabbixHost: '10.0.0.2' }),
      ],
    });
    const child = emptyMap({
      nodes: [hostNode({ id: 'fw', icon: 'firewall', zabbixHost: '10.0.0.3' })],
    });
    const ids = collectPresentHostTypeFilterIds([
      { mapId: ROOT_MAP_ID, mapLabel: 'Início', map: root },
      { mapId: 'filial', mapLabel: 'Filial', map: child },
    ]);
    expect(ids).toEqual(['firewall', 'camera']);
    expect(visibleNocFilterIds([{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map: root }])).toEqual([
      'offline',
      'online',
      'alert',
      'nodata',
      'congestedLinks',
      'link1g',
      'link10g',
      'link40g',
      'link100g',
      nocSubmapFilterId(ROOT_MAP_ID),
      'camera',
    ]);
  });

  it('lista submapas com host e combina com os demais filtros', () => {
    const root = emptyMap({
      nodes: [hostNode({ id: 'core', icon: 'router', label: 'core-a', zabbixHost: '10.0.0.1' })],
    });
    const child = emptyMap({
      nodes: [
        hostNode({ id: 'sw-up', icon: 'switch_managed', label: 'sw-up', zabbixHost: '10.0.0.2' }),
        hostNode({ id: 'sw-down', icon: 'switch_managed', label: 'sw-down', zabbixHost: '10.0.0.3' }),
      ],
    });
    const scopes = [
      { mapId: ROOT_MAP_ID, mapLabel: 'Início', map: root },
      { mapId: 'filial', mapLabel: 'Filial', map: child },
    ];
    expect(collectPresentSubmapFilterIds(scopes)).toEqual([
      nocSubmapFilterId(ROOT_MAP_ID),
      nocSubmapFilterId('filial'),
    ]);
    const ctx = {
      hostDisplay: {
        '10.0.0.1': { value: 1, status: 'online' as const },
        '10.0.0.2': { value: 1, status: 'online' as const },
        '10.0.0.3': { value: 0, status: 'offline' as const },
      },
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
    };
    const onlyFilial = collectNocHostEntries(new Set([nocSubmapFilterId('filial')]), scopes, ctx);
    expect(onlyFilial.map((e) => e.nodeId)).toEqual(['sw-down', 'sw-up']);
    const filialOffline = collectNocHostEntries(
      new Set([nocSubmapFilterId('filial'), 'offline']),
      scopes,
      ctx
    );
    expect(filialOffline.map((e) => e.nodeId)).toEqual(['sw-down']);
  });

  it('remove filtro de submapa que sumiu da árvore', () => {
    const active = new Set([nocSubmapFilterId('filial'), 'offline'] as const);
    const next = retainPresentNocTypeFilters(active, [], [nocSubmapFilterId(ROOT_MAP_ID)]);
    expect([...next]).toEqual(['offline']);
  });

  it('remove filtro de tipo sem host e preserva status e tipos presentes', () => {
    const active = new Set<'offline' | 'camera' | 'olt'>(['offline', 'camera', 'olt']);
    const next = retainPresentNocTypeFilters(active, ['olt']);
    expect([...next]).toEqual(['offline', 'olt']);
    expect(retainPresentNocTypeFilters(next, ['olt'])).toBe(next);
  });

  it('filtra pontas de cabo congestionado e marca a tag no host', () => {
    const ctx = {
      map,
      linkMetricsByLink: {
        [linkKey(map.links[0]!)]: {
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

  it('filtra online, offline e alerta (offline não entra em alerta)', () => {
    const nodeOnline = hostNode({ id: 'ok', zabbixHost: '10.0.0.2', zabbixHostId: '2002' });
    const nodeAlert = hostNode({ id: 'warn', zabbixHost: '10.0.0.3', zabbixHostId: '2003' });
    const nodeOffline = hostNode({ id: 'down', zabbixHost: '10.0.0.1', zabbixHostId: '2001' });
    const filterMap = emptyMap({ nodes: [nodeOnline, nodeAlert, nodeOffline] });
    const ctx = {
      map: filterMap,
      hostDisplay: {
        '10.0.0.2': { value: 1, status: 'online' as const },
        '10.0.0.3': { value: 1, status: 'online' as const },
        '10.0.0.1': { value: 0, status: 'offline' as const },
      },
      hostMetadata: {
        '10.0.0.2': { name: 'host-b', hostid: '2002' },
        '10.0.0.3': { name: 'host-c', hostid: '2003' },
        '10.0.0.1': { name: 'host-a', hostid: '2001' },
      },
      hostProblems: { '2003': { count: 1, maxSeverity: 4, names: ['Interface down'] } },
      options: { linkUtilThresholdHigh: 75 },
    };
    expect(isNodeVisibleForFilters(nodeOnline, new Set(['online']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(nodeAlert, new Set(['online']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(nodeOffline, new Set(['online']), ctx)).toBe(false);
    expect(isNodeVisibleForFilters(nodeOffline, new Set(['offline']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(nodeAlert, new Set(['alert']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(nodeOffline, new Set(['alert']), ctx)).toBe(false);
    expect(isNodeVisibleForFilters(nodeOnline, new Set(['alert']), ctx)).toBe(false);
  });

  it('filtra hosts sem dados da Query', () => {
    const withStatus = hostNode({ id: 'ok', zabbixHost: '10.0.0.2' });
    const noStatus = hostNode({ id: 'empty', zabbixHost: '10.0.0.8' });
    const filterMap = emptyMap({ nodes: [withStatus, noStatus] });
    const ctx = {
      map: filterMap,
      hostDisplay: { '10.0.0.2': { value: 1, status: 'online' as const } },
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
      queryReady: true,
    };
    expect(isNodeVisibleForFilters(noStatus, new Set(['nodata']), ctx)).toBe(true);
    expect(isNodeVisibleForFilters(withStatus, new Set(['nodata']), ctx)).toBe(false);
    const entries = collectNocHostEntries(new Set(['nodata']), [
      { mapId: ROOT_MAP_ID, mapLabel: 'Início', map: filterMap },
    ], ctx);
    expect(entries.map((e) => e.nodeId)).toEqual(['empty']);
  });

  it('filtro de tipo ou status não esconde os cabos', () => {
    const ctx = { map, options: { linkUtilThresholdHigh: 75 } };
    expect(isLinkVisibleForFilters(map.links[0], new Set(['olt']), ctx)).toBe(true);
    expect(isLinkVisibleForFilters({ from: 'core', to: 'inexistente' }, new Set(['offline']), ctx)).toBe(
      true
    );
  });

  it('filtra cabo pela capacidade', () => {
    const ctx = { map, options: { linkUtilThresholdHigh: 75 } };
    expect(isLinkVisibleForFilters({ ...map.links[0]!, bandwidthMbps: 10000 }, new Set(['link10g']), ctx)).toBe(
      true
    );
    expect(isLinkVisibleForFilters({ ...map.links[0]!, bandwidthMbps: 1000 }, new Set(['link10g']), ctx)).toBe(
      false
    );
    expect(isLinkVisibleForFilters({ ...map.links[0]!, bandwidthMbps: 1000 }, new Set(['link1g']), ctx)).toBe(
      true
    );
  });

  it('omite tag DOWN quando o filtro Offline já está ativo', () => {
    const offlineMap = emptyMap({
      nodes: [hostNode({ id: 'cam', icon: 'camera', label: 'cam-a', zabbixHost: '10.0.0.1' })],
    });
    const ctx = {
      hostDisplay: { '10.0.0.1': { value: 0, status: 'offline' as const } },
      hostMetadata: {},
      hostProblems: {},
      options: { linkUtilThresholdHigh: 75 },
      queryReady: true,
    };
    const withFilter = collectNocHostEntries(
      new Set(['offline']),
      [{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map: offlineMap }],
      ctx
    );
    expect(withFilter[0]?.tags).not.toContain('DOWN');
    const withoutFilter = collectNocHostEntries(
      new Set(),
      [{ mapId: ROOT_MAP_ID, mapLabel: 'Início', map: offlineMap }],
      ctx
    );
    expect(withoutFilter[0]?.tags).toContain('DOWN');
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

  it('lista hosts offline, em alerta da Query ou com problema Zabbix', () => {
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
    expect(entries.map((entry) => entry.nodeId)).toEqual(['olt', 'sw']);
    expect(entries[0]?.reason).toBe('offline');
    expect(entries[1]?.reason).toBe('alert');
  });

  it('offline vence problema Zabbix na lista de alertas', () => {
    const ctx = {
      map,
      hostDisplay: {
        '10.0.0.1': { value: 0, status: 'offline' as const },
      },
      hostProblems: { hostid1: { count: 1, maxSeverity: 4, names: ['ICMP timeout'] } },
      hostMetadata: { '10.0.0.1': { name: 'OLT', hostid: 'hostid1' } },
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectAlertHostEntries(ctx);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.reason).toBe('offline');
    expect(entries[0]?.problems).toBeUndefined();
    expect(alertListStatusLabel(entries[0]!)).toBe('OFFLINE');
    expect(alertListHoverText(entries[0]!)).toBe('Offline');
  });

  it('lastvalue 0 vence problema Zabbix mesmo se o display ainda disser online', () => {
    const ctx = {
      map,
      hostDisplay: {
        '10.0.0.1': { value: 0, status: 'online' as const },
      },
      hostProblems: { hostid1: { count: 1, maxSeverity: 4, names: ['ICMP timeout'] } },
      hostMetadata: { '10.0.0.1': { name: 'OLT', hostid: 'hostid1' } },
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectAlertHostEntries(ctx);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.reason).toBe('offline');
    expect(alertListStatusLabel(entries[0]!)).toBe('OFFLINE');
  });

  it('problema Zabbix sem lastvalue não entra na lista de alertas', () => {
    const ctx = {
      map,
      hostDisplay: {},
      hostProblems: { hostid1: { count: 1, maxSeverity: 4, names: ['ICMP timeout'] } },
      hostMetadata: { '10.0.0.1': { name: 'OLT', hostid: 'hostid1' } },
      options: { linkUtilThresholdHigh: 75 },
    };
    expect(collectAlertHostEntries(ctx)).toEqual([]);
  });

  it('lista host online com problemas Zabbix na lista de alertas', () => {
    const ctx = {
      map,
      hostDisplay: {
        '10.0.0.2': { value: 1, status: 'online' as const },
      },
      hostProblems: { hostid2: { count: 3, maxSeverity: 4 } },
      hostMetadata: { '10.0.0.2': { name: 'Core', hostid: 'hostid2' } },
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectAlertHostEntries(ctx);
    expect(entries.map((entry) => entry.nodeId)).toEqual(['core']);
    expect(entries[0]?.reason).toBe('alert');
  });

  it('não lista problema Zabbix abaixo de Warning', () => {
    const ctx = {
      map,
      hostDisplay: {
        '10.0.0.2': { value: 1, status: 'online' as const },
      },
      hostProblems: { hostid2: { count: 1, maxSeverity: 1 } },
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

  it('lista de alertas agrega problema Zabbix de mapa filho fora do mapa aberto', () => {
    const child: TopologyMap = {
      width: 800,
      height: 600,
      nodes: [{ id: 'sw1', type: 'host', icon: 'switch_managed', zabbixHost: '10.0.0.9', x: 0, y: 0 }],
      links: [],
    };
    const ctx = {
      hostDisplay: { '10.0.0.9': { value: 1, status: 'online' as const } },
      hostMetadata: { '10.0.0.9': { name: 'SW-01', hostid: 'hostid9' } },
      hostProblems: { hostid9: { count: 1, maxSeverity: 2, names: ['Interface down'] } },
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
    expect(entries[0]?.reason).toBe('alert');
    expect(entries[0]?.problems).toEqual(['Interface down']);
  });

  it('lista de alertas casa problema do mapa filho por alias do nó (label/IP) fora do mapa aberto', () => {
    const child: TopologyMap = {
      width: 800,
      height: 600,
      nodes: [
        {
          id: 'sw1',
          type: 'host',
          icon: 'switch_managed',
          label: 'host-b',
          zabbixHost: 'CPE-01',
          subtitle: '10.0.0.2',
          x: 0,
          y: 0,
        },
      ],
      links: [],
    };
    const ctx = {
      hostDisplay: { 'host-b': { value: 1, status: 'online' as const } },
      hostMetadata: { 'host-b': { name: 'host-b', hostid: '1002' } },
      hostProblems: { '1002': { count: 1, maxSeverity: 2, names: ['Interface down'] } },
      options: { linkUtilThresholdHigh: 75 },
    };
    const entries = collectAlertHostEntriesFromMaps(
      [
        { mapId: ROOT_MAP_ID, mapLabel: 'Início', map },
        { mapId: 'filial', mapLabel: 'Filial', map: child },
      ],
      ctx
    );
    expect(entries.map((e) => `${e.mapId}:${e.nodeId}`)).toEqual(['filial:sw1']);
    expect(entries[0]?.reason).toBe('alert');
    expect(entries[0]?.problems).toEqual(['Interface down']);
  });

  it('resolveHostProblemSummary encontra hostid pelo label quando zabbixHost é alias', () => {
    const summary = resolveHostProblemSummary(
      {
        id: 'sw1',
        type: 'host',
        label: 'host-b',
        zabbixHost: 'CPE-01',
        subtitle: '10.0.0.2',
        x: 0,
        y: 0,
      },
      { 'host-b': { name: 'host-b', hostid: '1002' } },
      { '1002': { count: 1, maxSeverity: 3, names: ['ICMP timeout'] } }
    );
    expect(summary).toEqual({ count: 1, maxSeverity: 3, names: ['ICMP timeout'] });
  });

  it('não pinta problema de outro hostid que só aparece num alias do nó', () => {
    const summary = resolveHostProblemSummary(
      {
        id: 'sw1',
        type: 'host',
        label: 'host-a',
        zabbixHost: 'CPE-01',
        subtitle: '10.0.0.1',
        x: 0,
        y: 0,
      },
      {
        'host-a': { name: 'host-a', ip: '10.0.0.1', hostid: '1001' },
        'CPE-01': { name: 'other', ip: '10.0.0.9', hostid: '1002' },
      },
      { '1002': { count: 1, maxSeverity: 4, names: ['Interface down'] } }
    );
    expect(summary).toBeUndefined();
  });

  it('visibleHostProblemNames recorta a lista e conta o restante', () => {
    expect(visibleHostProblemNames(['  a  ', '', 'b'])).toEqual({ visible: ['a', 'b'], hidden: 0 });
    const many = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    expect(visibleHostProblemNames(many)).toEqual({
      visible: ['p1', 'p2', 'p3', 'p4', 'p5'],
      hidden: 1,
    });
  });

  it('alertListHoverText usa os nomes de problema, não o rótulo genérico', () => {
    expect(
      alertListHoverText({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'alert',
        problems: ['Interface port-a com erros de entrada (alto)'],
      })
    ).toBe('Interface port-a com erros de entrada (alto)');
    expect(
      alertListHoverText({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'offline',
        problems: ['ICMP timeout'],
      })
    ).toBe('Offline');
  });

  it('alertListStatusLabel mostra o nome do problema na linha da lista', () => {
    expect(
      alertListStatusLabel({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'alert',
        problems: ['Interface down'],
      })
    ).toBe('Interface down');
    expect(
      alertListStatusLabel({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'alert',
      })
    ).toBe('ALERTA');
    expect(
      alertListStatusLabel({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'offline',
        problems: ['ICMP timeout'],
      })
    ).toBe('OFFLINE');
    expect(
      alertListStatusLines({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'alert',
        problems: ['Interface down', 'CPU alta'],
      })
    ).toEqual(['Interface down', 'CPU alta']);
    expect(
      alertListStatusLabel({
        nodeId: 'n1',
        mapId: 'root',
        mapLabel: '',
        label: 'host-a',
        reason: 'alert',
        problems: ['Interface down', 'CPU alta'],
      })
    ).toBe('Interface down · CPU alta');
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
