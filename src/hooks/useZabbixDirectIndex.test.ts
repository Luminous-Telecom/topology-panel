import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useZabbixDirectIndex, dropZabbixLiveIndex } from './useZabbixDirectIndex';
import { fetchBackendPoll, fetchLiveSnapshot, type BackendLiveSnapshot } from '../services/pluginBackend';

vi.mock('../services/pluginBackend', () => ({
  fetchBackendPoll: vi.fn(),
  fetchLiveSnapshot: vi.fn(async () => undefined),
}));

const poll = vi.mocked(fetchBackendPoll);
const snapshot = vi.mocked(fetchLiveSnapshot);

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
): BackendLiveSnapshot {
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

function pollResponse(snapshot: BackendLiveSnapshot) {
  return { snapshot, ready: true, loading: false };
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
    dropZabbixLiveIndex();
    poll.mockReset();
    snapshot.mockReset();
    snapshot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    dropZabbixLiveIndex();
  });

  it('monta o índice quando não há snapshot em cache', async () => {
    poll.mockResolvedValue(pollResponse(pollSnapshot([host('1', 'Backbone')])));

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
    expect(snapshot).toHaveBeenCalled();
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('hidrata pelo snapshot em cache sem chamar o poll na abertura', async () => {
    snapshot.mockResolvedValue(pollSnapshot([host('1', 'Backbone')]));

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
    expect(result.current.loading).toBe(false);
    expect(snapshot).toHaveBeenCalled();
    expect(poll).not.toHaveBeenCalled();
  });

  it('trocar os grupos mantém o índice anterior até o novo poll chegar', async () => {
    poll.mockResolvedValueOnce(pollResponse(pollSnapshot([host('1', 'Backbone')])));

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
    let finishNext: (value: ReturnType<typeof pollResponse>) => void = () => undefined;
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

    await act(async () => {
      finishNext(pollResponse(pollSnapshot([host('2', 'Borda')], 'Borda', '20')));
      await Promise.resolve();
    });
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.index.hosts).toContain('host-2');
    expect(result.current.index.hosts).not.toContain('host-1');
  });

  it('repassa erro do backend para a UI', async () => {
    poll.mockResolvedValue({
      snapshot: {
        savedAt: Date.now(),
        metadata: { hosts: [], resolvedGroups: [], groupIds: [] },
        knownStatusItems: [],
        lastValues: {},
        interfaceItems: [],
        problems: {},
      },
      ready: false,
      loading: false,
      error: 'Nenhum dos grupos configurados existe no Zabbix.',
    });

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

  it('reconsulta o backend no intervalo configurado', async () => {
    snapshot.mockResolvedValue(pollSnapshot([host('1', 'Backbone')]));
    poll.mockResolvedValue(pollResponse(pollSnapshot([host('1', 'Backbone')])));

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
    expect(poll).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('sessão em memória sobrevive à remontagem do hook na mesma aba', async () => {
    poll.mockResolvedValue(pollResponse(pollSnapshot([host('1', 'Backbone')])));

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
    expect(poll).not.toHaveBeenCalled();
  });
});
