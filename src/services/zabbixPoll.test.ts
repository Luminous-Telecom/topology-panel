import { describe, expect, it, vi } from 'vitest';
import type { ZabbixLiveSnapshot } from '../utils/zabbixApi';
import type { ZabbixParams, ZabbixRpc } from './zabbixCall';
import { runZabbixPoll, sameStatusItemValues, ZABBIX_NO_GROUPS_ERROR } from './zabbixPoll';

function fakeCall(handlers: Record<string, unknown>): ZabbixRpc {
  return async (_uid: string, method: string, _params: ZabbixParams) => {
    if (method in handlers) {
      return handlers[method] as never;
    }
    throw new Error(`método inesperado: ${method}`);
  };
}

const previous: ZabbixLiveSnapshot = {
  savedAt: 1,
  metadata: {
    hosts: [{ hostid: '1', host: 'host-1', name: 'host-1', groups: ['Backbone'] }],
    resolvedGroups: ['Backbone'],
    groupIds: ['10'],
  },
  knownStatusItems: [{ itemid: '10001', key_: 'icmpping', lastvalue: '1', hostid: '1' }],
  lastValues: { '10001': { itemid: '10001', lastvalue: '1', lastclock: '10' } },
  interfaceItems: [],
  problems: {},
};

describe('runZabbixPoll', () => {
  it('em regime faz um item.get pelos itemids e não relê host/problema', async () => {
    const methods: string[] = [];
    const call: ZabbixRpc = async (_uid, method) => {
      methods.push(method);
      if (method === 'item.get') {
        return [
          {
            itemid: '10001',
            key_: 'icmpping',
            hostid: '1',
            lastvalue: '0',
            lastclock: '20',
          },
        ] as never;
      }
      throw new Error(method);
    };
    const result = await runZabbixPoll(
      {
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        trafficItemIds: [],
        trafficKeys: [],
        previous,
      },
      call
    );
    expect(methods).toEqual(['item.get']);
    expect(result.error).toBeUndefined();
    expect(result.snapshot.lastValues['10001']?.lastvalue).toBe('0');
    expect(result.snapshot.knownStatusItems[0]?.lastvalue).toBe('0');
  });

  it('em regime não rediscobre quando um host do grupo não tem item de status', async () => {
    const methods: string[] = [];
    const call: ZabbixRpc = async (_uid, method) => {
      methods.push(method);
      if (method === 'item.get') {
        return [
          {
            itemid: '10001',
            key_: 'icmpping',
            hostid: '1',
            lastvalue: '1',
            lastclock: '20',
          },
        ] as never;
      }
      throw new Error(method);
    };
    const withGap: ZabbixLiveSnapshot = {
      ...previous,
      metadata: {
        ...previous.metadata,
        hosts: [
          ...previous.metadata.hosts,
          { hostid: '2', host: 'host-2', name: 'host-2', groups: ['Backbone'] },
        ],
      },
    };
    const result = await runZabbixPoll(
      {
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        trafficItemIds: [],
        trafficKeys: [],
        previous: withGap,
      },
      call
    );
    expect(methods).toEqual(['item.get']);
    expect(result.error).toBeUndefined();
    expect(result.snapshot.lastValues['10001']?.lastvalue).toBe('1');
  });

  it('na descoberta resolve grupos e devolve erro se nenhum existir', async () => {
    const result = await runZabbixPoll(
      {
        datasourceUid: 'ds',
        groupNames: ['Inexistente'],
        statusItemKey: 'icmpping',
        trafficItemIds: [],
        trafficKeys: [],
      },
      fakeCall({
        'hostgroup.get': [{ groupid: '10', name: 'Backbone' }],
      })
    );
    expect(result.error).toBe(ZABBIX_NO_GROUPS_ERROR);
    expect(result.snapshot.metadata.resolvedGroups).toEqual([]);
  });

  it('na descoberta pinta o lastvalue sem esperar problem.get', async () => {
    let releaseProblems: () => void = () => undefined;
    const problemsGate = new Promise<void>((resolve) => {
      releaseProblems = resolve;
    });
    const painted: ZabbixLiveSnapshot[] = [];
    const call: ZabbixRpc = async (_uid, method) => {
      if (method === 'hostgroup.get') {
        return [{ groupid: '10', name: 'Backbone' }] as never;
      }
      if (method === 'host.get') {
        return [
          {
            hostid: '1',
            host: 'host-1',
            name: 'host-1',
            hostgroups: [{ name: 'Backbone' }],
            interfaces: [{ ip: '10.0.0.1', main: '1', type: '1' }],
          },
        ] as never;
      }
      if (method === 'item.get') {
        return [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: '10' }] as never;
      }
      if (method === 'problem.get') {
        await problemsGate;
        return [] as never;
      }
      throw new Error(method);
    };
    const done = runZabbixPoll(
      {
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        trafficItemIds: [],
        trafficKeys: [],
        onSnapshot: (snapshot) => painted.push(snapshot),
      },
      call
    );
    await vi.waitFor(() => {
      expect(painted.length).toBe(1);
    });
    expect(painted[0]?.knownStatusItems[0]?.lastvalue).toBe('1');
    expect(painted[0]?.lastValues['10001']?.lastvalue).toBe('1');
    releaseProblems();
    const result = await done;
    expect(result.error).toBeUndefined();
    expect(result.snapshot.knownStatusItems[0]?.lastvalue).toBe('1');
  });

  it('na descoberta guarda icmppingsec parametrizado como status, não como tráfego', async () => {
    const call: ZabbixRpc = async (_uid, method) => {
      if (method === 'hostgroup.get') {
        return [{ groupid: '10', name: 'Backbone' }] as never;
      }
      if (method === 'host.get') {
        return [
          {
            hostid: '1',
            host: 'host-1',
            name: 'host-1',
            hostgroups: [{ name: 'Backbone' }],
          },
        ] as never;
      }
      if (method === 'item.get') {
        return [
          { itemid: '10001', key_: 'icmppingsec[,,,,]', hostid: '1', lastvalue: '0', lastclock: '10' },
          { itemid: '20001', key_: 'vendor.metric.rx[10]', hostid: '1', lastvalue: '10' },
        ] as never;
      }
      if (method === 'problem.get') {
        return [] as never;
      }
      throw new Error(method);
    };
    const result = await runZabbixPoll(
      {
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmppingsec',
        trafficItemIds: [],
        trafficKeys: ['vendor.metric.rx[10]'],
      },
      call
    );
    expect(result.error).toBeUndefined();
    expect(result.snapshot.knownStatusItems.map((item) => item.key_)).toEqual(['icmppingsec[,,,,]']);
    expect(result.snapshot.knownStatusItems[0]?.lastvalue).toBe('0');
  });

  it('na descoberta dispara host, item e problema no mesmo instante', async () => {
    const started: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const call: ZabbixRpc = async (_uid, method, params) => {
      if (method === 'hostgroup.get') {
        return [{ groupid: '10', name: 'Backbone' }] as never;
      }
      started.push(method);
      await gate;
      if (method === 'host.get') {
        return [
          {
            hostid: '1',
            host: 'host-1',
            name: 'host-1',
            hostgroups: [{ name: 'Backbone' }],
          },
        ] as never;
      }
      if (method === 'item.get') {
        if (Array.isArray(params?.itemids)) {
          return [
            { itemid: '20001', key_: 'vendor.metric.rx[10]', hostid: '1', lastvalue: '10' },
          ] as never;
        }
        return [{ itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1' }] as never;
      }
      if (method === 'problem.get') {
        return [] as never;
      }
      throw new Error(method);
    };
    const done = runZabbixPoll(
      {
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        trafficItemIds: ['20001'],
        trafficKeys: [],
      },
      call
    );
    await vi.waitFor(() => {
      expect([...started].sort()).toEqual(['host.get', 'item.get', 'item.get', 'problem.get']);
    });
    release();
    const result = await done;
    expect(result.error).toBeUndefined();
    expect(result.snapshot.lastValues['10001']?.lastvalue).toBe('1');
    expect(result.snapshot.lastValues['20001']?.lastvalue).toBe('10');
  });
});

describe('sameStatusItemValues', () => {
  it('ignora lastclock e compara só o lastvalue por itemid', () => {
    expect(
      sameStatusItemValues(
        [{ itemid: '10001', key_: 'icmpping', lastvalue: '1', lastclock: '20', hostid: '1' }],
        [{ itemid: '10001', key_: 'icmpping', lastvalue: '1', lastclock: '10', hostid: '1' }]
      )
    ).toBe(true);
  });

  it('é falso quando o lastvalue de status mudou', () => {
    expect(
      sameStatusItemValues(
        [{ itemid: '10001', key_: 'icmpping', lastvalue: '0', hostid: '1' }],
        [{ itemid: '10001', key_: 'icmpping', lastvalue: '1', hostid: '1' }]
      )
    ).toBe(false);
  });
});
