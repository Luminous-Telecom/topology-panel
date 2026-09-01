import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import { buildHostNodeBadgeMap } from './hostBadges';

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

describe('buildHostNodeBadgeMap', () => {
  it('resolve badge de problemas só para os hosts', () => {
    const badges = buildHostNodeBadgeMap({
      map,
      hostMetadata: { '10.0.0.1': { name: 'Core', hostid: 'hostid1' } },
      hostProblems: { hostid1: { count: 3, maxSeverity: 4 } },
    });
    expect(badges.get('core')?.map((b) => b.kind)).toEqual(['problems']);
    expect(badges.has('olt')).toBe(false);
    expect(badges.has('regiao')).toBe(false);
  });

  it('não mostra badge de problema quando o host está offline', () => {
    const badges = buildHostNodeBadgeMap({
      map,
      hostDisplay: { '10.0.0.1': { value: 0, status: 'offline' } },
      hostMetadata: { '10.0.0.1': { name: 'Core', hostid: 'hostid1' } },
      hostProblems: { hostid1: { count: 3, maxSeverity: 4 } },
    });
    expect(badges.has('core')).toBe(false);
  });

  it('não cria entrada para host sem nada a mostrar', () => {
    expect(buildHostNodeBadgeMap({ map }).size).toBe(0);
  });
});
