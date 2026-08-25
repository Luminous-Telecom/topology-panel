import { EventBusSrv } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchZabbixDirectMetadata, resolveZabbixItemIdsByKeys } from '../utils/zabbixApi';
import {
  fetchZabbixStatusViaQuery,
  fetchZabbixTrafficLastValuesViaQuery,
} from '../utils/zabbixDatasourceQuery';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';

vi.mock('../utils/zabbixApi', () => ({
  fetchZabbixDirectMetadata: vi.fn(),
  isBenignZabbixFetchError: vi.fn(() => false),
  isNumericZabbixItemId: (value: string | undefined) => Boolean(value && /^\d+$/.test(value.trim())),
  resolveZabbixItemIdsByKeys: vi.fn(async () => new Map()),
}));

vi.mock('../utils/zabbixDatasourceQuery', () => ({
  fetchZabbixStatusViaQuery: vi.fn(),
  fetchZabbixTrafficLastValuesViaQuery: vi.fn(async () => ({})),
}));

const fetchMetadata = vi.mocked(fetchZabbixDirectMetadata);
const fetchStatus = vi.mocked(fetchZabbixStatusViaQuery);
const fetchLastValues = vi.mocked(fetchZabbixTrafficLastValuesViaQuery);
const resolveKeys = vi.mocked(resolveZabbixItemIdsByKeys);

function host(id: string, group: string) {
  return {
    hostid: id,
    host: `host-${id}`,
    name: `host-${id}`,
    ip: `10.0.0.${id}`,
    groups: [group],
  };
}

function statusItem(hostid: string) {
  return {
    itemid: `item-${hostid}`,
    key_: 'icmpping',
    lastvalue: '1',
    lastclock: '1000',
    hostid,
  };
}

function statusSnapshot(
  hostid: string,
  problems: Record<string, { count: number; maxSeverity: number; names?: string[] }> = {}
) {
  return { items: [statusItem(hostid)], hoverByHost: {}, lastValues: {}, problems };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useZabbixDirectIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMetadata.mockReset();
    fetchStatus.mockReset();
    fetchLastValues.mockReset();
    fetchLastValues.mockResolvedValue({});
    resolveKeys.mockReset();
    resolveKeys.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trocar os grupos não zera o índice enquanto o novo snapshot não chega', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));

    const { result, rerender } = renderHook(
      ({ groupNames }: { groupNames: string[] }) =>
        useZabbixDirectIndex({
          enabled: true,
          datasourceUid: 'ds',
          groupNames,
          statusItemKey: 'icmpping',
          refreshSec: 60,
        }),
      { initialProps: { groupNames: ['Backbone'] } }
    );

    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');

    let finishNext: (value: Awaited<ReturnType<typeof fetchZabbixDirectMetadata>>) => void = () =>
      undefined;
    fetchMetadata.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNext = resolve;
        })
    );
    fetchStatus.mockResolvedValueOnce(statusSnapshot('2'));

    rerender({ groupNames: ['Borda'] });
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');

    await act(async () => {
      finishNext({
        hosts: [host('2', 'Borda')],
        resolvedGroups: ['Borda'],
        groupIds: ['20'],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.index.hosts).toContain('host-2');
    expect(result.current.index.hosts).not.toContain('host-1');
  });

  it('busca o último ponto da série dos cabos em paralelo ao status', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));
    fetchLastValues.mockResolvedValueOnce({ '10': { itemid: '10', lastvalue: '1' } });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10', '11'],
      })
    );

    await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10', '11'], 60, expect.any(AbortSignal));
    expect(result.current.lastValues['10']?.lastvalue).toBe('1');
  });

  it('traz problemas Warning+ no mesmo snapshot do status', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(
      statusSnapshot('1', { '1': { count: 1, maxSeverity: 4, names: ['Interface down'] } })
    );

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );

    await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(result.current.ready).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');
    expect(result.current.problems['1']?.names).toEqual(['Interface down']);
  });

  it('falha isolada da busca de problemas não impede o status dos hosts', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce({
      items: [statusItem('1')],
      hoverByHost: {},
      lastValues: {},
      problems: {},
      problemsUnavailable: true,
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );

    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');
    expect(result.current.problems).toEqual({});
  });

  it('resolve chave de cabo para itemid e devolve o lastvalue pela key', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    resolveKeys.mockResolvedValueOnce(new Map([['1:vendor.metric.rx[10]', '77']]));
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));
    fetchLastValues.mockResolvedValueOnce({ '77': { itemid: '77', lastvalue: '500000000' } });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficKeys: ['vendor.metric.rx[10]'],
      })
    );

    await flush();
    expect(resolveKeys).toHaveBeenCalledWith(
      'ds',
      ['vendor.metric.rx[10]'],
      expect.any(AbortSignal),
      ['1']
    );
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['77'], 60, expect.any(AbortSignal));
    expect(result.current.lastValues['1:vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
  });

  it('não dispara ds.query de status de novo no RefreshEvent do carregamento do dashboard', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
    const eventBus = new EventBusSrv();

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        eventBus,
      })
    );

    await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      eventBus.publish(new RefreshEvent());
      await Promise.resolve();
    });

    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('não reinicia o poll quando o Grafana troca a identidade do eventBus', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));

    const { rerender } = renderHook(
      ({ eventBus }: { eventBus: EventBusSrv }) =>
        useZabbixDirectIndex({
          enabled: true,
          datasourceUid: 'ds',
          groupNames: ['Backbone'],
          statusItemKey: 'icmpping',
          refreshSec: 60,
          eventBus,
        }),
      { initialProps: { eventBus: new EventBusSrv() } }
    );

    await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    rerender({ eventBus: new EventBusSrv() });
    await flush();

    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});
