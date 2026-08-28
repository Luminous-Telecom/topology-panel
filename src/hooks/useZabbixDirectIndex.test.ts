import { EventBusSrv } from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchZabbixDirectMetadata,
  fetchZabbixResolvedGroups,
  fetchZabbixSignalInventory,
  fetchZabbixTrafficLastValues,
} from '../utils/zabbixApi';
import { fetchZabbixStatusViaQuery, prefetchZabbixDatasource } from '../utils/zabbixDatasourceQuery';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';
import { clearZabbixSnapshotCache } from '../services/zabbixSnapshotCache';

vi.mock('../utils/zabbixApi', () => ({
  fetchZabbixDirectMetadata: vi.fn(),
  fetchZabbixResolvedGroups: vi.fn(async () => ({ resolvedGroups: ['Backbone'], groupIds: ['10'] })),
  fetchZabbixSignalInventory: vi.fn(async () => []),
  fetchZabbixTrafficLastValues: vi.fn(async () => ({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] })),
  isBenignZabbixFetchError: vi.fn(() => false),
  isNumericZabbixItemId: (value: string | undefined) => Boolean(value && /^\d+$/.test(value.trim())),
}));

vi.mock('../utils/zabbixDatasourceQuery', () => ({
  fetchZabbixStatusViaQuery: vi.fn(),
  prefetchZabbixDatasource: vi.fn(),
}));

const fetchMetadata = vi.mocked(fetchZabbixDirectMetadata);
const fetchStatus = vi.mocked(fetchZabbixStatusViaQuery);
const fetchLastValues = vi.mocked(fetchZabbixTrafficLastValues);
const fetchSignalInventory = vi.mocked(fetchZabbixSignalInventory);
const fetchResolvedGroups = vi.mocked(fetchZabbixResolvedGroups);
const prefetchDatasource = vi.mocked(prefetchZabbixDatasource);

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
    itemid: `item-${hostid}`,
    key_: 'icmpping',
    lastvalue,
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
    fetchLastValues.mockResolvedValue({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] });
    fetchSignalInventory.mockReset();
    fetchSignalInventory.mockResolvedValue([]);
    fetchResolvedGroups.mockReset();
    fetchResolvedGroups.mockResolvedValue({ resolvedGroups: ['Backbone'], groupIds: ['10'] });
    prefetchDatasource.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearZabbixSnapshotCache();
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
    fetchResolvedGroups.mockResolvedValue({ resolvedGroups: ['Borda'], groupIds: ['20'] });
    fetchStatus.mockResolvedValue(statusSnapshot('2'));

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
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
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

  it('busca o lastvalue dos cabos em paralelo ao status', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));
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
        refreshSec: 60,
        trafficItemIds: ['10', '11'],
      })
    );

    await flush();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10', '11'], expect.any(AbortSignal), [], undefined);
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
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));
    fetchLastValues.mockResolvedValueOnce({
      lastValues: {
        '77': { itemid: '77', lastvalue: '500000000' },
        '1:vendor.metric.rx[10]': { itemid: '77', lastvalue: '500000000' },
      },
      itemIdByKey: new Map([['1:vendor.metric.rx[10]', '77']]),
      interfaceItems: [],
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
    expect(fetchLastValues).toHaveBeenCalledWith('ds', [], expect.any(AbortSignal), ['vendor.metric.rx[10]'], undefined);
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

  it('relê os hosts monitorados a cada ciclo e tira o status de host desativado', async () => {
    fetchMetadata
      .mockResolvedValueOnce({
        hosts: [host('1', 'Backbone')],
        resolvedGroups: ['Backbone'],
        groupIds: ['10'],
      })
      .mockResolvedValueOnce({
        hosts: [],
        resolvedGroups: ['Backbone'],
        groupIds: ['10'],
      });
    fetchStatus.mockResolvedValue({
      items: [statusItem('1', '0')],
      hoverByHost: {},
      lastValues: {},
      problems: {},
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
    expect(result.current.index.hosts).toContain('host-1');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(2);
    expect(result.current.index.hosts).not.toContain('host-1');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.has('host-1')).toBe(false);
  });

  it('publica o mapa sem esperar a varredura de sinal terminar', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));
    fetchLastValues.mockResolvedValueOnce({
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      itemIdByKey: new Map(),
      interfaceItems: [],
    });
    // Varredura lenta: antes ela ficava no mesmo `await` do ciclo e segurava a primeira pintura.
    fetchSignalInventory.mockReturnValueOnce(new Promise(() => undefined));

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        trafficItemIds: ['10'],
        signalHostIds: ['1'],
        signalSearchTerms: ['optical'],
      })
    );

    await flush();
    expect(fetchLastValues).toHaveBeenCalledWith('ds', ['10'], expect.any(AbortSignal), [], undefined);
    expect(fetchSignalInventory).toHaveBeenCalledWith('ds', ['1'], ['optical'], expect.any(AbortSignal));
    expect(result.current.loading).toBe(false);
    expect(result.current.lastValues['10']?.lastvalue).toBe('1');
  });

  it('não varre sinal em todos os hosts do grupo quando os extremos dos cabos ainda não resolveram', async () => {
    fetchMetadata.mockResolvedValueOnce({
      hosts: [host('1', 'Backbone'), host('2', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValueOnce(statusSnapshot('1'));

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        signalSearchTerms: ['optical'],
      })
    );

    await flush();
    expect(fetchSignalInventory).not.toHaveBeenCalled();
  });

  it('pinta o mapa assim que o host.get volta, sem esperar o ds.query', async () => {
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
    expect(prefetchDatasource).toHaveBeenCalledWith('ds');
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.index.hosts).toContain('host-1');
    expect(result.current.lastValues['10']).toBeUndefined();
    expect(fetchStatus).toHaveBeenCalled();
  });

  it('tráfego e status dos hosts entram no mapa no mesmo snapshot', async () => {
    let resolveStatus: ((value: ReturnType<typeof statusSnapshot>) => void) | undefined;
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
    fetchStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      })
    );

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
    expect(result.current.index.hosts).toContain('host-1');
    expect(result.current.lastValues['10']).toBeUndefined();
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.has('host-1')).toBe(false);

    await act(async () => {
      resolveStatus?.(statusSnapshot('1'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.lastValues['10']?.lastvalue).toBe('1');
    expect(result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
  });

  it('reabrir o painel pinta status e tráfego do último snapshot sem esperar o Zabbix', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
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
    first.unmount();

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

    expect(second.result.current.ready).toBe(true);
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.index.hosts).toContain('host-1');
    expect(second.result.current.index.byRefId.get('BACKBONE')?.lastValues.get('host-1')).toBe(1);
    expect(second.result.current.lastValues['10']?.lastvalue).toBe('1');
    second.unmount();
  });

  it('ciclo sem lastvalue de cabo não apaga o tráfego que já estava no mapa', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
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

  it('não dispara o ds.query enquanto o host.get da primeira pintura não voltou', async () => {
    fetchMetadata.mockReturnValueOnce(new Promise(() => undefined));
    fetchStatus.mockResolvedValue(statusSnapshot('1'));

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

  it('a varredura de sinal não usa o abort do ciclo', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
    let cycleSignal: AbortSignal | undefined;
    fetchLastValues.mockImplementation(async (_uid, _ids, abortSignal) => {
      cycleSignal = abortSignal;
      return { lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] };
    });
    let signalSignal: AbortSignal | undefined;
    fetchSignalInventory.mockImplementation(async (_uid, _hosts, _terms, abortSignal) => {
      signalSignal = abortSignal;
      return [];
    });

    renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 10,
        trafficItemIds: ['10'],
        signalHostIds: ['1'],
        signalSearchTerms: ['optical'],
      })
    );

    await flush();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    await flush();

    expect(signalSignal).toBeDefined();
    expect(signalSignal).not.toBe(cycleSignal);
    // O ciclo seguinte aborta o anterior; se a varredura viajasse nesse mesmo sinal, morreria no meio.
    expect(signalSignal?.aborted).toBe(false);
  });

  it('desmontar aborta o item.get isolado disparado pela troca de cabo', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
    fetchLastValues.mockResolvedValue({ lastValues: {}, itemIdByKey: new Map(), interfaceItems: [] });

    const { rerender, unmount } = renderHook(
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

    let trafficSignal: AbortSignal | undefined;
    fetchLastValues.mockImplementation(async (_uid, _ids, abortSignal) => {
      trafficSignal = abortSignal;
      return new Promise(() => undefined);
    });

    rerender({ trafficItemIds: ['11'] });
    await flush();
    expect(trafficSignal).toBeDefined();
    expect(trafficSignal?.aborted).toBe(false);

    unmount();
    expect(trafficSignal?.aborted).toBe(true);
  });

  it('entre releituras de identidade o ciclo não repete host.get nem os problemas', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus
      .mockResolvedValueOnce(
        statusSnapshot('1', { '1': { count: 1, maxSeverity: 4, names: ['Interface down'] } })
      )
      .mockResolvedValue({
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
        refreshSec: 10,
      })
    );

    await flush();
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchStatus.mock.calls[0]?.[0].includeProblems).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchStatus.mock.calls[1]?.[0].includeProblems).toBe(false);
    // O badge do ciclo anterior continua: pular problemas não pode apagar alerta.
    expect(result.current.problems['1']?.names).toEqual(['Interface down']);
  });

  it('passa os grupos já resolvidos adiante para não repetir o hostgroup.get', async () => {
    const meta = { hosts: [host('1', 'Backbone')], resolvedGroups: ['Backbone'], groupIds: ['10'] };
    fetchMetadata.mockResolvedValue(meta);
    fetchStatus.mockResolvedValue(statusSnapshot('1'));

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

    expect(fetchMetadata).toHaveBeenCalledTimes(2);
    expect(fetchMetadata.mock.calls[1]?.[3]).toEqual({ resolvedGroups: ['Backbone'], groupIds: ['10'] });
  });

  it('no ciclo seguinte relê por itemid só o sinal em uso, sem varrer o inventário de novo', async () => {
    fetchMetadata.mockResolvedValue({
      hosts: [host('1', 'Backbone')],
      resolvedGroups: ['Backbone'],
      groupIds: ['10'],
    });
    fetchStatus.mockResolvedValue(statusSnapshot('1'));
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
        signalHostIds: ['1'],
        signalSearchTerms: ['optical'],
        selectSignalItemIds: (items) =>
          items.filter((item) => item.itemid === '30').map((item) => item.itemid),
      })
    );

    await flush();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSignalInventory).toHaveBeenCalledTimes(1);
    expect(fetchLastValues).toHaveBeenCalledTimes(2);
    // Só a porta que o cabo usa entra na releitura; a `99` fica de fora.
    expect(fetchLastValues).toHaveBeenLastCalledWith('ds', ['10', '30'], expect.any(AbortSignal), [], ['1']);
  });
});
