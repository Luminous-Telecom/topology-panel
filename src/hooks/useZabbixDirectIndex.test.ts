import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useZabbixDirectIndex } from './useZabbixDirectIndex';
import { runZabbixPoll } from '../services/zabbixPoll';
import { fetchZabbixBackendStatus } from '../services/zabbixBackendStatus';
import type { ZabbixLiveSnapshot } from '../utils/zabbixApi';

vi.mock('../services/zabbixPoll', async () => {
  const actual = await vi.importActual<typeof import('../services/zabbixPoll')>('../services/zabbixPoll');
  return {
    ...actual,
    runZabbixPoll: vi.fn(),
  };
});

vi.mock('../services/zabbixBackendStatus', async () => {
  const actual = await vi.importActual<typeof import('../services/zabbixBackendStatus')>(
    '../services/zabbixBackendStatus'
  );
  return {
    ...actual,
    fetchZabbixBackendStatus: vi.fn(),
  };
});

const poll = vi.mocked(runZabbixPoll);
const backend = vi.mocked(fetchZabbixBackendStatus);

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

function pollSnapshot(
  hosts: ReturnType<typeof host>[],
  group = 'Backbone',
  groupId = '10'
): ZabbixLiveSnapshot {
  return {
    savedAt: Date.now(),
    metadata: {
      hosts,
      resolvedGroups: [group],
      groupIds: [groupId],
    },
    knownStatusItems: hosts.map((entry) => statusItem(entry.hostid)),
    lastValues: Object.fromEntries(
      hosts.map((entry) => [
        `${10000 + Number(entry.hostid)}`,
        { itemid: `${10000 + Number(entry.hostid)}`, lastvalue: '1', lastclock: '1000' },
      ])
    ),
    interfaceItems: [],
    problems: {},
  };
}

function pollResult(snapshot: ZabbixLiveSnapshot, error?: string) {
  return { snapshot, error };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useZabbixDirectIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    poll.mockReset();
    backend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consulta o Zabbix na abertura e monta o índice', async () => {
    poll.mockResolvedValue(pollResult(pollSnapshot([host('1', 'Backbone')])));

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
    expect(poll).toHaveBeenCalledTimes(1);
    expect(poll.mock.calls[0]?.[0].previous).toBeUndefined();
  });

  it('snapshot sem lastvalue não marca o índice pronto', async () => {
    const hosts = [host('1', 'Backbone')];
    poll.mockResolvedValue(
      pollResult({
        savedAt: Date.now(),
        metadata: {
          hosts,
          resolvedGroups: ['Backbone'],
          groupIds: ['10'],
        },
        knownStatusItems: hosts.map((entry) => ({
          itemid: `${10000 + Number(entry.hostid)}`,
          key_: 'icmpping',
          hostid: entry.hostid,
        })),
        lastValues: {},
        interfaceItems: [],
        problems: {},
      })
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
    expect(result.current.ready).toBe(false);
    expect(result.current.index.hosts).toEqual([]);
  });

  it('trocar os grupos mantém o índice anterior até o novo poll chegar', async () => {
    poll.mockResolvedValueOnce(pollResult(pollSnapshot([host('1', 'Backbone')])));

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
    expect(result.current.index.hosts).toContain('host-1');

    poll.mockReset();
    let finishNext: (value: ReturnType<typeof pollResult>) => void = () => undefined;
    poll.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishNext = resolve;
        })
    );

    rerender({ groupNames: ['Borda'] });
    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.loading).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');
    expect(poll.mock.calls[0]?.[0].previous).toBeUndefined();

    await act(async () => {
      finishNext(pollResult(pollSnapshot([host('2', 'Borda')], 'Borda', '20')));
      await Promise.resolve();
    });
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.index.hosts).toContain('host-2');
    expect(result.current.index.hosts).not.toContain('host-1');
  });

  it('repassa erro do poll para a UI', async () => {
    poll.mockResolvedValue(
      pollResult(
        {
          savedAt: Date.now(),
          metadata: { hosts: [], resolvedGroups: [], groupIds: [] },
          knownStatusItems: [],
          lastValues: {},
          interfaceItems: [],
          problems: {},
        },
        'Nenhum dos grupos configurados existe no Zabbix.'
      )
    );

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Inexistente'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
      })
    );

    await flush();
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toMatch(/grupos configurados/);
  });

  it('poll com o mesmo lastvalue de status reusa o QueryIndex', async () => {
    const first = pollSnapshot([host('1', 'Backbone')]);
    const second: ZabbixLiveSnapshot = {
      ...first,
      savedAt: Date.now() + 1,
      lastValues: { '10001': { itemid: '10001', lastvalue: '1', lastclock: '2000' } },
      knownStatusItems: first.knownStatusItems.map((item) => ({ ...item, lastclock: '2000' })),
    };
    poll.mockResolvedValueOnce(pollResult(first)).mockResolvedValueOnce(pollResult(second));

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
    const indexAfterFirst = result.current.index;
    expect(indexAfterFirst.hosts).toContain('host-1');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(poll).toHaveBeenCalledTimes(2);
    expect(result.current.index).toBe(indexAfterFirst);
    expect(result.current.lastValues['10001']?.lastclock).toBe('2000');
  });

  it('lastvalue "1" e "1.0" reusa o QueryIndex', async () => {
    const first = pollSnapshot([host('1', 'Backbone')]);
    const second: ZabbixLiveSnapshot = {
      ...first,
      savedAt: Date.now() + 1,
      lastValues: { '10001': { itemid: '10001', lastvalue: '1.0', lastclock: '2000' } },
      knownStatusItems: first.knownStatusItems.map((item) => ({ ...item, lastvalue: '1.0', lastclock: '2000' })),
    };
    poll.mockResolvedValueOnce(pollResult(first)).mockResolvedValueOnce(pollResult(second));

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
    const indexAfterFirst = result.current.index;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(poll).toHaveBeenCalledTimes(2);
    expect(result.current.index).toBe(indexAfterFirst);
  });

  it('lastvalue de status novo troca o QueryIndex mas reusa metadata e hosts', async () => {
    const first = pollSnapshot([host('1', 'Backbone')]);
    const second: ZabbixLiveSnapshot = {
      ...first,
      savedAt: Date.now() + 1,
      lastValues: { '10001': { itemid: '10001', lastvalue: '0', lastclock: '2000' } },
      knownStatusItems: first.knownStatusItems.map((item) => ({ ...item, lastvalue: '0', lastclock: '2000' })),
    };
    poll.mockResolvedValueOnce(pollResult(first)).mockResolvedValueOnce(pollResult(second));

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
    const indexAfterFirst = result.current.index;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(result.current.index).not.toBe(indexAfterFirst);
    expect(result.current.index.metadata).toBe(indexAfterFirst.metadata);
    expect(result.current.index.hosts).toBe(indexAfterFirst.hosts);
    expect(result.current.lastValues['10001']?.lastvalue).toBe('0');
  });

  it('reconsulta no intervalo configurado', async () => {
    poll.mockResolvedValue(pollResult(pollSnapshot([host('1', 'Backbone')])));

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
    expect(poll).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[1]?.[0].previous).toBeDefined();
  });

  it('não empilha um poll novo enquanto o anterior não terminou', async () => {
    const snap = pollSnapshot([host('1', 'Backbone')]);
    let finishHanging: (value: ReturnType<typeof pollResult>) => void = () => undefined;
    poll
      .mockResolvedValueOnce(pollResult(snap))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishHanging = resolve;
          })
      )
      .mockResolvedValue(pollResult(snap));

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
    expect(poll).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishHanging(pollResult(snap));
      await Promise.resolve();
    });
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('poll com erro depois de pronto mantém o lastvalue', async () => {
    const snap = pollSnapshot([host('1', 'Backbone')]);
    poll
      .mockResolvedValueOnce(pollResult(snap))
      .mockResolvedValueOnce(
        pollResult(
          {
            savedAt: Date.now(),
            metadata: { hosts: [], resolvedGroups: [], groupIds: [] },
            knownStatusItems: [],
            lastValues: {},
            interfaceItems: [],
            problems: {},
          },
          'Nenhum host dos grupos respondeu com o item de status. Confira o nome do item em "Item de status".'
        )
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
    expect(result.current.ready).toBe(true);
    expect(result.current.lastValues['10001']?.lastvalue).toBe('1');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(result.current.ready).toBe(true);
    expect(result.current.lastValues['10001']?.lastvalue).toBe('1');
    expect(result.current.error).toMatch(/item de status/);
  });

  it('remontar o hook consulta o Zabbix de novo', async () => {
    poll.mockResolvedValue(pollResult(pollSnapshot([host('1', 'Backbone')])));

    const props = {
      enabled: true,
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      refreshSec: 60,
    };

    const first = renderHook(() => useZabbixDirectIndex(props));
    await flush();
    expect(first.result.current.ready).toBe(true);
    first.unmount();

    poll.mockClear();
    const second = renderHook(() => useZabbixDirectIndex(props));
    await flush();

    expect(second.result.current.ready).toBe(true);
    expect(second.result.current.index.hosts).toContain('host-1');
    expect(poll).toHaveBeenCalledTimes(1);
    expect(poll.mock.calls[0]?.[0].previous).toBeUndefined();
  });

  it('com a flag, consulta o resource do backend e não chama runZabbixPoll', async () => {
    backend.mockResolvedValue({
      savedAt: Date.now(),
      hosts: [
        {
          hostId: '1',
          host: 'host-1',
          name: 'host-1',
          ip: '10.0.0.1',
          groups: ['Backbone'],
          lastvalue: '1',
          lastclock: '1000',
          itemId: '10001',
        },
      ],
      regionStats: [{ nodeId: 'net1', up: 1, down: 0, degraded: 0, unknown: 0, total: 1 }],
      problems: {},
      lastValues: { '10001': { itemid: '10001', lastvalue: '1', lastclock: '1000' } },
      interfaceItems: [],
    });

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        pollViaBackend: true,
      })
    );

    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');
    expect(result.current.regionStats?.get('net1')?.online).toBe(1);
    expect(backend).toHaveBeenCalledTimes(1);
    expect(poll).not.toHaveBeenCalled();
  });

  it('HTTP 404 do backend volta ao poll do browser', async () => {
    backend.mockRejectedValue({ status: 404 });
    poll.mockResolvedValue(pollResult(pollSnapshot([host('1', 'Backbone')])));

    const { result } = renderHook(() =>
      useZabbixDirectIndex({
        enabled: true,
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        refreshSec: 60,
        pollViaBackend: true,
      })
    );

    await flush();
    expect(result.current.ready).toBe(true);
    expect(result.current.index.hosts).toContain('host-1');
    expect(backend).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
