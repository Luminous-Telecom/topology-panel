import { describe, expect, it } from 'vitest';
import { LinkRuntimeMetricsMap, TopologyMap } from '../../types';
import { aggregateHostTrafficByNode, buildHostNodeBadgeMap } from './hostBadges';

const map: TopologyMap = {
  width: 800,
  height: 600,
  nodes: [
    { id: 'core', type: 'host', zabbixHost: '10.0.0.1', x: 0, y: 0 },
    { id: 'olt', type: 'host', zabbixHost: '10.0.0.2', x: 0, y: 0 },
    { id: 'regiao', type: 'network', x: 0, y: 0 },
  ],
  links: [{ from: 'core', to: 'olt' }],
};

const linkMetrics: LinkRuntimeMetricsMap = {
  'core-olt': {
    from: { rxBps: 1_000_000, txBps: 500_000 },
    to: { rxBps: 200_000, txBps: 100_000 },
    status: 'up',
  },
};

describe('aggregateHostTrafficByNode', () => {
  it('soma o tráfego de cada ponta numa única passada pelos cabos', () => {
    const totals = aggregateHostTrafficByNode(map, linkMetrics);
    expect(totals.get('core')).toBe(1_500_000);
    expect(totals.get('olt')).toBe(300_000);
  });

  it('devolve mapa vazio sem métricas de link', () => {
    expect(aggregateHostTrafficByNode(map, undefined).size).toBe(0);
  });
});

describe('buildHostNodeBadgeMap', () => {
  it('resolve badge de problemas e de tráfego só para os hosts', () => {
    const badges = buildHostNodeBadgeMap({
      map,
      hostMetadata: { '10.0.0.1': { name: 'Core', hostid: 'hostid1' } },
      hostProblems: { hostid1: { count: 3, maxSeverity: 4 } },
      linkMetrics,
    });
    expect(badges.get('core')?.map((b) => b.kind)).toEqual(['problems', 'traffic']);
    expect(badges.get('olt')?.map((b) => b.kind)).toEqual(['traffic']);
    expect(badges.has('regiao')).toBe(false);
  });

  it('não cria entrada para host sem nada a mostrar', () => {
    expect(buildHostNodeBadgeMap({ map }).size).toBe(0);
  });
});
