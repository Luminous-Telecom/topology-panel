import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOptions } from '../types';
import { emptyMap, hostNode } from '../utils/testMapFixtures';
import { fetchZabbixItemLastValues } from '../utils/zabbixApi';
import { useLinkMetricsRuntime } from './useLinkMetricsRuntime';

vi.mock('../utils/zabbixApi', () => ({
  fetchZabbixItemLastValues: vi.fn(),
}));

const fetchLastValues = vi.mocked(fetchZabbixItemLastValues);

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

let uidSeq = 0;

function renderMetrics(runtime: { refreshSec?: number | null; queryRefreshKey?: unknown }) {
  uidSeq += 1;
  const uid = `ds-link-metrics-${uidSeq}`;
  const utils = renderHook(
    ({ refreshSec, queryRefreshKey }: { refreshSec?: number | null; queryRefreshKey?: unknown }) =>
      useLinkMetricsRuntime(uid, mapWithTraffic(), defaultOptions(), true, {
        refreshSec,
        queryRefreshKey,
      }),
    { initialProps: runtime }
  );
  return utils;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useLinkMetricsRuntime', () => {
  const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

  beforeEach(() => {
    vi.useFakeTimers();
    fetchLastValues.mockReset();
    fetchLastValues.mockResolvedValue({
      '10': { itemid: '10', lastvalue: '1' },
      '11': { itemid: '11', lastvalue: '2' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (hiddenDesc) {
      Object.defineProperty(document, 'hidden', hiddenDesc);
    } else {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        enumerable: true,
        get: () => false,
      });
    }
  });

  it('trocar zabbixRefreshSec de 10s para 30s muda o intervalo sem remontar o painel', async () => {
    const { rerender } = renderMetrics({ refreshSec: 10 });
    await flush();
    expect(fetchLastValues).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(2);

    rerender({ refreshSec: 30 });
    await flush();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(3);
  });

  it('sem refreshSec (modo query) não arma setInterval — só reage a queryRefreshKey', async () => {
    const { rerender } = renderMetrics({ refreshSec: null, queryRefreshKey: { n: 1 } });
    await flush();
    expect(fetchLastValues).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(1);

    rerender({ refreshSec: null, queryRefreshKey: { n: 2 } });
    await flush();
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
  });

  it('aba oculta pausa o fetch de tráfego até voltar a ficar visível', async () => {
    renderMetrics({ refreshSec: 10 });
    await flush();
    expect(fetchLastValues).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      enumerable: true,
      get: () => true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      enumerable: true,
      get: () => false,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
  });
});
