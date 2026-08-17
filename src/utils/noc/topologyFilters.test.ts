import { describe, expect, it } from 'vitest';
import { TopologyMap } from '../../types';
import { isNodeVisibleForFilters, computeNocMapSummary } from './topologyFilters';

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
});
