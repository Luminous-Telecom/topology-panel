import { describe, expect, it } from 'vitest';
import { buildLinkRuntimeMetricsMap } from './linkMetricsRuntime';
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
});
