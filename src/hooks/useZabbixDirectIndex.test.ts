import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchZabbixDirectMetadata,
  fetchZabbixProblems,
  fetchZabbixResolvedGroups,
  fetchZabbixSignalInventory,
  fetchZabbixStatusLastValues,
  fetchZabbixTrafficLastValues,
} from '../utils/zabbixApi';
import { useZabbixDirectIndex, dropZabbixLiveIndex } from './useZabbixDirectIndex';
import {
  clearZabbixSnapshotCache,
  dropZabbixSnapshotMemory,
  persistZabbixItemIdCatalog,
  readZabbixItemIdCatalog,
  zabbixSnapshotCacheKey,
} from '../services/zabbixSnapshotCache';
import { clearPollClock } from '../utils/pollingGate';

vi.mock('../utils/zabbixApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/zabbixApi')>();
  return {
    ...actual,
    fetchZabbixDirectMetadata: vi.fn(),
    fetchZabbixProblems: vi.fn(async () => ({})),
    fetchZabbixResolvedGroups: vi.fn(async () => ({ resolvedGroups: ['Backbone'], groupIds: ['10'] })),
    fetchZabbixSignalInventory: vi.fn(async () => []),
    fetchZabbixStatusLastValues: vi.fn(),
    fetchZabbixTrafficLastValues: vi.fn(async () => ({
      lastValues: {},
      itemIdByKey: new Map(),
      interfaceItems: [],
    })),
    isBenignZabbixFetchError: vi.fn(() => false),
  };
});

const fetchMetadata = vi.mocked(fetchZabbixDirectMetadata);
const fetchStatus = vi.mocked(fetchZabbixStatusLastValues);
const fetchProblems = vi.mocked(fetchZabbixProblems);
const fetchLastValues = vi.mocked(fetchZabbixTrafficLastValues);
const fetchSignalInventory = vi.mocked(fetchZabbixSignalInventory);
const fetchResolvedGroups = vi.mocked(fetchZabbixResolvedGroups);

function host(id: string, group: string) {
  return {
    hostid: id,
    host: `host-${id}`,
    name: `host-${id}`,
    ip: `10.0.0.${id}`,
    groups: [group],
  };
}

function statusItem(hostid: string, lastvalue = '1') {
  return {
    itemid: `${10000 + Number(hostid)}`,
    key_: 'icmpping',
    lastvalue,
    lastclock: '1000',
    hostid,
  };
}

function statusItems(hostid: string, lastvalue = '1') {
  return [statusItem(hostid, lastvalue)];
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useZabbixDirectIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearPollClock();
    dropZabbixLiveIndex();
    fetchMetadata.mockReset();
    fetchStatus.mockReset();
    fetchProblems.mockReset();
    fetchProblems.mockResolvedValue({});
    fetchLastValues.mockReset();
    fetchLastValues.mockResolvedValue({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] });
    fetchSignalInventory.mockReset();
    fetchSignalInventory.mockResolvedValue([]);
    fetchResolvedGroups.mockReset();
    fetchResolvedGroups.mockResolvedValue({ resolvedGroups: ['Backbone'], groupIds: ['10'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    clearZabbixSnapshotCache();
    dropZabbixLiveIndex();
    clearPollClock();
  });

  it('trocar os grupos não zera o índice enquanto o novo snapshot não chega', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusItems('1'));

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
    fetchResolvedGroups.mockResolvedValue({ resolvedGroups: ['Borda'], groupIds: ['20'] });
    fetchStatus.mockResolvedValue(statusItems('2'));

    rerender({ groupNames: ['Borda'] });
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');

    await flush();
    await act(async () => {
      finishNext({
        hosts: [host('2', 'Borda')],
        resolvedGroups: ['Borda'],
        groupIds: ['20'],
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.index.hosts).toContain('host-2');
    expect(result.current.index.hosts).not.toContain('host-1');
  });

  it('apagar itemids de cabo não deixa o mapa cinza enquanto o status não relê', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });

    const { result, rerender } = renderHook(
      ({ trafficItemIds }: { trafficItemIds: string[] }) =>
        useZabbixDirectIndex({
          enabled: true,
          datasourceUid: 'ds',
          groupNames: ['Backbone'],
          statusItemKey: 'icmpping',
          refreshSec: 60,
          trafficItemIds,
        }),
      { initialProps: { trafficItemIds: ['10'] } }
    );

    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);

    fetchStatus.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ trafficItemIds: [] });
    await flush();

    expect(result.current.ready).toBe(true);
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
    expect(result.current.error).toBeUndefined();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('no ciclo em regime o lastvalue dos cabos entra no mesmo item.get do status', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });

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
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledWith(
      'ds',
      ['10', '11', '10001'],
      expect.any(AbortSignal),
      [],
      ['1']
    );
    expect(result.current.lastValues['10']?.lastvalue).toBe('1');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchProblems).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
    expect(fetchLastValues).toHaveBeenLastCalledWith(
      'ds',
      ['10', '11', '10001'],
      expect.any(AbortSignal),
      [],
      ['1']
    );
  });

  it('poll com o mesmo lastvalue não troca o índice nem grava snapshot de valor', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '1', lastclock: '1000' },
        '10001': { itemid: '10001', lastvalue: '1', lastclock: '1000' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '1000' }],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    const indexAfterFirst = result.current.index;
    const lastValuesAfterFirst = result.current.lastValues;
    expect(result.current.ready).toBe(true);

    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '1', lastclock: '2000' },
        '10001': { itemid: '10001', lastvalue: '1', lastclock: '2000' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '2000' }],
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.index).toBe(indexAfterFirst);
    expect(result.current.lastValues).toBe(lastValuesAfterFirst);
    const cacheKey = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    expect(readZabbixItemIdCatalog(cacheKey)?.statusItems[0]?.itemid).toBe('10001');
  });

  it('poll com lastvalue novo atualiza o status', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '1' },
        '10001': { itemid: '10001', lastvalue: '1' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1' }],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);

    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '1' },
        '10001': { itemid: '10001', lastvalue: '0' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '0' }],
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(0);
  });

  it('poll só com tráfego novo reusa o índice de hosts', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '100' },
        '10001': { itemid: '10001', lastvalue: '1' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1' }],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    const indexAfterFirst = result.current.index;
    expect(result.current.lastValues['10']?.lastvalue).toBe('100');

    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '250' },
        '10001': { itemid: '10001', lastvalue: '1' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1' }],
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.index).toBe(indexAfterFirst);
    expect(result.current.lastValues['10']?.lastvalue).toBe('250');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
  });

  it('não consulta problemas no poll — cada ciclo é um POST só', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusItems('1'));

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
    expect(fetchProblems).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');
  });

  it('resolve chave de cabo no item.get de descoberta e devolve o lastvalue pela key', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce([
      ...statusItems('1'),
      {
        itemid: '77',
        key_: 'vendor.metric.rx[10]',
        lastvalue: '500000000',
        lastclock: '1000',
        hostid: '1',
      },
    ]);

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
    expect(fetchLastValues).not.toHaveBeenCalled();
    expect(fetchStatus).toHaveBeenCalledWith('ds', 'icmpping', ['1'], expect.any(AbortSignal), [
      'vendor.metric.rx[10]',
    ]);
    expect(result.current.lastValues['1:vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
  });

  it('com catálogo de itemids lê lastvalue das chaves de cabo num item.get por key', async () => {
    persistZabbixItemIdCatalog(zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping'), {
      statusItems: statusItems('1'),
      lastValues: {},
      interfaceItems: [],
    });
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchLastValues
      .mockResolvedValueOnce({
        lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
        itemIdByKey: new Map(),
        interfaceItems: [],
      })
      .mockResolvedValueOnce({
        lastValues: {
          '77': { itemid: '77', lastvalue: '500000000' },
          '1:vendor.metric.rx[10]': { itemid: '77', lastvalue: '500000000' },
        },
        itemIdByKey: new Map([['1:vendor.metric.rx[10]', '77']]),
        interfaceItems: [
          { itemid: '77', key_: 'vendor.metric.rx[10]', hostid: '1', lastvalue: '500000000', lastclock: '1000' },
        ],
      });

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
    expect(fetchMetadata).toHaveBeenCalled();
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenNthCalledWith(1, 'ds', ['10001'], expect.any(AbortSignal), [], ['1']);
    expect(fetchLastValues).toHaveBeenNthCalledWith(
      2,
      'ds',
      [],
      expect.any(AbortSignal),
      ['vendor.metric.rx[10]'],
      ['1']
    );
    expect(result.current.lastValues['1:vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
  });

  it('item de status por nome lê lastvalue das chaves de cabo num item.get por key', async () => {
    persistZabbixItemIdCatalog(zabbixSnapshotCacheKey('ds', ['Backbone'], 'ICMP ping'), {
      statusItems: [
        { itemid: '10001', key_: 'icmpping', lastvalue: '1', lastclock: '1000', hostid: '1' },
      ],
      lastValues: {},
      interfaceItems: [],
    });
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchLastValues
      .mockResolvedValueOnce({
        lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
        itemIdByKey: new Map(),
        interfaceItems: [],
      })
      .mockResolvedValueOnce({
        lastValues: {
          '77': { itemid: '77', lastvalue: '500000000' },
          '1:vendor.metric.rx[10]': { itemid: '77', lastvalue: '500000000' },
        },
        itemIdByKey: new Map([['1:vendor.metric.rx[10]', '77']]),
        interfaceItems: [
          { itemid: '77', key_: 'vendor.metric.rx[10]', hostid: '1', lastvalue: '500000000', lastclock: '1000' },
        ],
      });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'ICMP ping',
        refreshSec: 60,
        trafficKeys: ['vendor.metric.rx[10]'],
      })
    );

    await flush();
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenNthCalledWith(1, 'ds', ['10001'], expect.any(AbortSignal), [], ['1']);
    expect(fetchLastValues).toHaveBeenNthCalledWith(
      2,
      'ds',
      [],
      expect.any(AbortSignal),
      ['vendor.metric.rx[10]'],
      ['1']
    );
    expect(result.current.lastValues['1:vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
  });

  it('com catálogo de itemids relê lastvalue por id depois do host.get, sem item.get por hostids', async () => {
    persistZabbixItemIdCatalog(zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping'), {
      statusItems: statusItems('1'),
      lastValues: {
        '1:vendor.metric.rx[10]': { itemid: '77', lastvalue: '500000000' },
      },
      interfaceItems: [
        { itemid: '77', key_: 'vendor.metric.rx[10]', hostid: '1', lastvalue: '500000000', lastclock: '1000' },
      ],
    });
    dropZabbixSnapshotMemory();
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10001': { itemid: '10001', lastvalue: '1' },
        '77': { itemid: '77', lastvalue: '500000000' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [
        { itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '1000' },
        { itemid: '77', key_: 'vendor.metric.rx[10]', hostid: '1', lastvalue: '500000000', lastclock: '1000' },
      ],
    });

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
    expect(fetchMetadata).toHaveBeenCalled();
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenCalledWith(
      'ds',
      expect.arrayContaining(['10001', '77']),
      expect.any(AbortSignal),
      [],
      ['1']
    );
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
    expect(result.current.lastValues['77']?.lastvalue).toBe('500000000');
  });

  it('só busca de novo quando o intervalo do plugin vence — não no meio do ciclo', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));

    renderHook(() =>
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

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(fetchStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it('ciclo em regime não relê host.get — um POST só', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1', '0'));
    fetchLastValues.mockResolvedValue({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] });

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
    expect(result.current.index.hosts).toContain('host-1');
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
    expect(result.current.index.hosts).toContain('host-1');
  });

  it('não dispara varredura de sinal no poll', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusItems('1'));

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(fetchSignalInventory).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10', '10001'], expect.any(AbortSignal), [], ['1']);
    expect(result.current.loading).toBe(false);
  });

  it('não varre sinal em todos os hosts do grupo quando os extremos dos cabos ainda não resolveram', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone'), host('2', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusItems('1'));

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );

    await flush();
    expect(fetchSignalInventory).not.toHaveBeenCalled();
  });

  it('não pinta o mapa sem lastvalue ao vivo — espera o item.get de status', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchLastValues.mockResolvedValueOnce({
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });
    fetchStatus.mockReturnValueOnce(new Promise(() => undefined));

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(true);
    expect(result.current.index.hosts).not.toContain('host-1');
    expect(result.current.lastValues['10']).toBeUndefined();
    expect(fetchLastValues).not.toHaveBeenCalled();
  });

  it('pinta lastvalue de status e cabos só quando o item.get conjunto volta', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '1' },
        '10001': { itemid: '10001', lastvalue: '1' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '1000' }],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(result.current.lastValues['10']?.lastvalue).toBe('1');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10', '10001'], expect.any(AbortSignal), [], ['1']);
  });

  it('não pinta lastvalue de status nem de cabo se o item.get conjunto não voltou', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchLastValues.mockReturnValueOnce(new Promise(() => undefined));
    fetchStatus.mockResolvedValueOnce(statusItems('1'));

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(true);
    expect(result.current.index.hosts).not.toContain('host-1');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBeUndefined();
    expect(result.current.lastValues['10']).toBeUndefined();
  });

  it('F5 não pinta lastvalue do localStorage — espera o Zabbix', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });

    const first = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );
    await flush();
    expect(first.result.current.ready).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(first.result.current.lastValues['10']?.lastvalue).toBe('1');
    first.unmount();
    dropZabbixLiveIndex();

    fetchMetadata.mockReturnValue(new Promise(() => undefined));
    fetchStatus.mockReturnValue(new Promise(() => undefined));
    fetchLastValues.mockReturnValue(new Promise(() => undefined));

    const second = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    expect(second.result.current.ready).toBe(false);
    expect(second.result.current.loading).toBe(true);
    expect(second.result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBeUndefined();
    expect(second.result.current.lastValues['10']).toBeUndefined();
    second.unmount();
  });

  it('ciclo sem lastvalue de cabo não apaga o tráfego que já estava no mapa', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValueOnce({
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 10,
        trafficItemIds: ['10'],
      })
    );
    await flush();
    expect(result.current.lastValues['10']?.lastvalue).toBe('1');

    fetchLastValues.mockResolvedValue({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(result.current.ready).toBe(true);
    expect(result.current.lastValues['10']?.lastvalue).toBe('1');
  });

  it('não dispara o item.get de status enquanto o host.get da primeira pintura não voltou', async () => {
    fetchMetadata.mockReturnValueOnce(new Promise(() => undefined));
    fetchStatus.mockResolvedValue(statusItems('1'));

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );

    await flush();
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it('desmontar aborta o item.get de status da descoberta', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    let statusSignal: AbortSignal | undefined;
    fetchStatus.mockImplementation(async (_uid, _key, _hosts, abortSignal) => {
      statusSignal = abortSignal;
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(statusSignal).toBeDefined();
    expect(statusSignal?.aborted).toBe(false);

    unmount();
    expect(statusSignal?.aborted).toBe(true);
  });

  it('no ciclo em regime relê o status no mesmo item.get dos cabos', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue([
      { itemid: '51', key_: 'icmpping', lastvalue: '1', lastclock: '1000', hostid: '1' },
    ]);
    fetchLastValues.mockResolvedValue({
      lastValues: {
        '10': { itemid: '10', lastvalue: '1' },
        '51': { itemid: '51', lastvalue: '1' },
      },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '51', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '1000' }],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 10,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10', '51'], expect.any(AbortSignal), [], ['1']);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
    expect(fetchLastValues).toHaveBeenLastCalledWith('ds', ['10', '51'], expect.any(AbortSignal), [], ['1']);
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
  });

  it('cada intervalo do plugin relê só o lastvalue num item.get', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: { '10001': { itemid: '10001', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '1000' }],
    });

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 10,
      })
    );

    await flush();
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchProblems).not.toHaveBeenCalled();
    expect(fetchLastValues).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchProblems).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
  });

  it('passa os grupos já resolvidos adiante para não repetir o hostgroup.get', async () => {
    const meta = { hosts: [host('1', 'Backbone')], resolvedGroups: ['Backbone'], groupIds: ['10'] };
    fetchMetadata.mockResolvedValue(meta);
    fetchStatus.mockResolvedValue(statusItems('1'));

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 10,
      })
    );

    await flush();
    expect(fetchMetadata.mock.calls[0]?.[3]).toEqual({ resolvedGroups: ['Backbone'], groupIds: ['10'] });

    for (let cycle = 0; cycle < 6; cycle++) {
      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it('no ciclo seguinte relê por itemid só o sinal em uso, sem varrer o inventário de novo', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({
      lastValues: { '30': { itemid: '30', lastvalue: '-8.5' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });
    fetchSignalInventory.mockResolvedValue([
      { itemid: '30', key_: 'vendor.optical.rxpower[10]', name: 'port-a', hostid: '1', lastvalue: '-8.5' },
      { itemid: '99', key_: 'vendor.optical.rxpower[99]', name: 'port-z', hostid: '1', lastvalue: '-20' },
    ]);

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
      })
    );

    await flush();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSignalInventory).not.toHaveBeenCalled();
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
    expect(fetchLastValues).toHaveBeenLastCalledWith('ds', ['10', '10001'], expect.any(AbortSignal), [], ['1']);
  });

  it('remontar o painel no meio do intervalo não dispara outro ciclo', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));

    const first = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );
    await flush();
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    first.unmount();

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );
    await flush();
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(59_000);
      await Promise.resolve();
    });
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
  });

  it('trocar itemids de cabo não busca até o intervalo vencer', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusItems('1'));
    fetchLastValues.mockResolvedValue({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] });

    const { rerender } = renderHook(
      ({ trafficItemIds }: { trafficItemIds: string[] }) =>
        useZabbixDirectIndex({
          enabled: true,
          datasourceUid: 'ds',
          groupNames: ['Backbone'],
          statusItemKey: 'icmpping',
          refreshSec: 60,
          trafficItemIds,
        }),
      { initialProps: { trafficItemIds: ['10'] } }
    );

    await flush();
    expect(fetchLastValues).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10', '10001'], expect.any(AbortSignal), [], ['1']);

    rerender({ trafficItemIds: ['11'] });
    await flush();
    expect(fetchLastValues).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
    expect(fetchLastValues).toHaveBeenLastCalledWith('ds', ['11', '10001'], expect.any(AbortSignal), [], ['1']);
  });
});
