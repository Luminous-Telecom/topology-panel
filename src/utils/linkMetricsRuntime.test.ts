import { describe, expect, it } from 'vitest';
import { buildLinkRuntimeMetricsMap, resolveLinkMapTrafficMetrics } from './linkMetricsRuntime';
import { emptyMap } from './testMapFixtures';

describe('buildLinkRuntimeMetricsMap', () => {
  it('calcula RX/TX e utilização por endpoint', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'a',
          to: 'b',
          bandwidthMbps: 1000,
          fromInterface: {
            name: 'eth0',
            metrics: {
              rx: { itemId: '10' },
              tx: { itemId: '11' },
              operStatus: { itemId: '12' },
            },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      '10': { itemid: '10', lastvalue: '500000000' },
      '11': { itemid: '11', lastvalue: '100000000' },
      '12': { itemid: '12', lastvalue: '1' },
    });
    const linkMetrics = metrics['a-b'];
    expect(linkMetrics?.from.rxBps).toBe(500000000);
    expect(linkMetrics?.from.txBps).toBe(100000000);
    expect(linkMetrics?.from.rxUtilizationPct).toBe(50);
    expect(linkMetrics?.from.txUtilizationPct).toBe(10);
    expect(linkMetrics?.status).toBe('up');
  });

  it('usa métricas do destino quando a origem não tem RX/TX (nuvem / link externo)', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'cloud',
          to: 'sw',
          toInterface: {
            name: 'eth0',
            metrics: {
              rx: { itemId: '20' },
              tx: { itemId: '21' },
            },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      '20': { itemid: '20', lastvalue: '800000000' },
      '21': { itemid: '21', lastvalue: '200000000' },
    });
    const runtime = metrics['cloud-sw'];
    const display = resolveLinkMapTrafficMetrics(map.links[0]!, runtime);
    expect(display.txBps).toBe(800000000);
    expect(display.rxBps).toBe(200000000);
  });
});
