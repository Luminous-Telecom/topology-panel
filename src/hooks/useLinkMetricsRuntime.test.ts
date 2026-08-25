import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { linkKey } from '../utils/mapLinkEdits';
import { emptyMap, hostNode } from '../utils/testMapFixtures';
import { useLinkMetricsRuntime } from './useLinkMetricsRuntime';

function mapWithTraffic() {
  return {
    ...emptyMap({
      nodes: [hostNode({ id: 'a' }), hostNode({ id: 'b', x: 80 })],
    }),
    links: [
      {
        from: 'a',
        to: 'b',
        fromInterface: { name: 'eth0', metrics: { rx: { itemId: '10' }, tx: { itemId: '11' } } },
      },
    ],
  };
}

describe('useLinkMetricsRuntime', () => {
  it('monta RX/TX do cabo a partir dos lastvalues do poll de status', () => {
    const { result } = renderHook(() =>
      useLinkMetricsRuntime(mapWithTraffic(), defaultOptions(), {
        '10': { itemid: '10', lastvalue: '500000000' },
        '11': { itemid: '11', lastvalue: '100000000' },
      })
    );

    const key = linkKey(mapWithTraffic().links[0]!);
    expect(result.current.metricsByLink[key]?.from.rxBps).toBe(500000000);
    expect(result.current.metricsByLink[key]?.from.txBps).toBe(100000000);
  });

  it('sem lastvalues devolve o mapa vazio estável', () => {
    const { result, rerender } = renderHook(
      ({ values }: { values: Record<string, { itemid: string; lastvalue: string }> }) =>
        useLinkMetricsRuntime(mapWithTraffic(), defaultOptions(), values),
      { initialProps: { values: {} } }
    );

    const first = result.current.metricsByLink;
    expect(first).toEqual({});
    rerender({ values: {} });
    expect(result.current.metricsByLink).toBe(first);
  });
});
