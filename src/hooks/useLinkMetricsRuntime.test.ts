import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { linkKey } from '../utils/mapLinkEdits';
import { emptyMap, hostNode } from '../utils/testMapFixtures';
import { ZabbixPollFeed } from '../utils/zabbixPollVolatile';
import { createLinkMetricsLiveStore } from './linkMetricsLiveStore';
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

function createTestPollFeed(): ZabbixPollFeed & { push: (lastValues: Record<string, { itemid: string; lastvalue: string; lastclock?: string }>) => void } {
  let snapshot = {
    lastValues: {} as Record<string, { itemid: string; lastvalue: string; lastclock?: string }>,
    interfaceItems: [] as import('../utils/zabbixApi').ZabbixInterfaceItem[],
  };
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    push(lastValues) {
      snapshot = { ...snapshot, lastValues };
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe('useLinkMetricsRuntime', () => {
  it('monta RX/TX do cabo a partir do feed do poll', async () => {
    const map = mapWithTraffic();
    const feed = createTestPollFeed();
    const store = createLinkMetricsLiveStore();
    feed.push({
      '10': { itemid: '10', lastvalue: '500000000' },
      '11': { itemid: '11', lastvalue: '100000000' },
    });
    renderHook(() => useLinkMetricsRuntime(map, defaultOptions(), feed, undefined, store));

    const key = linkKey(map.links[0]!);
    await waitFor(() => {
      expect(store.getLive()[key]?.from.rxBps).toBe(500000000);
    });
    expect(store.getLive()[key]?.from.txBps).toBe(100000000);
  });

  it('sem lastvalues devolve o mapa vazio estável', async () => {
    const feed = createTestPollFeed();
    const store = createLinkMetricsLiveStore();
    const { rerender } = renderHook(() =>
      useLinkMetricsRuntime(mapWithTraffic(), defaultOptions(), feed, undefined, store)
    );

    await waitFor(() => {
      expect(store.getLive()).toEqual({});
    });
    const first = store.getLive();
    await act(async () => {
      rerender();
    });
    expect(store.getLive()).toBe(first);
  });

  it('nova coleta com o mesmo lastvalue não troca a identidade das métricas do cabo', async () => {
    const map = mapWithTraffic();
    const feed = createTestPollFeed();
    const store = createLinkMetricsLiveStore();
    feed.push({
      '10': { itemid: '10', lastvalue: '500000000', lastclock: '1000' },
      '11': { itemid: '11', lastvalue: '100000000', lastclock: '1000' },
    });
    renderHook(() => useLinkMetricsRuntime(map, defaultOptions(), feed, undefined, store));

    const key = linkKey(map.links[0]!);
    await waitFor(() => {
      expect(store.getLive()[key]).toBeDefined();
    });
    const first = store.getLive();
    await act(async () => {
      feed.push({
        '10': { itemid: '10', lastvalue: '500000000', lastclock: '2000' },
        '11': { itemid: '11', lastvalue: '100000000', lastclock: '2000' },
      });
    });
    await waitFor(() => {
      expect(store.getLive()).toBe(first);
    });
  });

  it('lastvalue novo troca só o cabo que mudou', async () => {
    const map = mapWithTraffic();
    const feed = createTestPollFeed();
    const store = createLinkMetricsLiveStore();
    feed.push({
      '10': { itemid: '10', lastvalue: '500000000', lastclock: '1000' },
      '11': { itemid: '11', lastvalue: '100000000', lastclock: '1000' },
    });
    renderHook(() => useLinkMetricsRuntime(map, defaultOptions(), feed, undefined, store));

    const key = linkKey(map.links[0]!);
    await waitFor(() => {
      expect(store.getLive()[key]).toBeDefined();
    });
    const first = store.getLive();
    await act(async () => {
      feed.push({
        '10': { itemid: '10', lastvalue: '600000000', lastclock: '2000' },
        '11': { itemid: '11', lastvalue: '100000000', lastclock: '2000' },
      });
    });
    await waitFor(() => {
      expect(store.getLive()[key]?.from.rxBps).toBe(600000000);
    });
    expect(store.getLive()[key]?.from.txBps).toBe(100000000);
  });

  it('paintMetricsByLink mantém identidade quando só o bps mudou', async () => {
    const map = mapWithTraffic();
    const feed = createTestPollFeed();
    const store = createLinkMetricsLiveStore();
    feed.push({
      '10': { itemid: '10', lastvalue: '500000000', lastclock: '1000' },
      '11': { itemid: '11', lastvalue: '100000000', lastclock: '1000' },
    });
    const { result } = renderHook(() =>
      useLinkMetricsRuntime(map, defaultOptions(), feed, undefined, store)
    );

    const key = linkKey(map.links[0]!);
    await waitFor(() => {
      expect(result.current.paintMetricsByLink[key]).toBeDefined();
    });
    const firstPaint = result.current.paintMetricsByLink[key];
    await act(async () => {
      feed.push({
        '10': { itemid: '10', lastvalue: '600000000', lastclock: '2000' },
        '11': { itemid: '11', lastvalue: '100000000', lastclock: '2000' },
      });
    });
    await waitFor(() => {
      expect(store.getLive()[key]?.from.rxBps).toBe(600000000);
    });
    expect(result.current.paintMetricsByLink[key]).toBe(firstPaint);
  });
});
