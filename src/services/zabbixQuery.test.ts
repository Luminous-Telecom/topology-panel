import { describe, expect, it } from 'vitest';
import type { ZabbixParams, ZabbixRpc } from './zabbixCall';
import {
  dropPingScriptCache,
  fetchDirectMetadata,
  fetchHostGroupNames,
  fetchHostInterfaceItems,
  fetchItemNames,
  fetchProblems,
  fetchStatusLastValues,
  fetchTrafficLastValues,
  parseProblems,
  runZabbixPing,
  statusItemSearch,
  ZABBIX_ITEM_GET_BATCH,
} from './zabbixQuery';

function fakeCall(handlers: Record<string, unknown>): ZabbixRpc {
  return async (_uid: string, method: string, _params: ZabbixParams) => {
    if (method in handlers) {
      return handlers[method] as never;
    }
    throw new Error(`método inesperado: ${method}`);
  };
}

describe('statusItemSearch', () => {
  it('trata identificador simples como filtro de key', () => {
    expect(statusItemSearch('icmpping')).toEqual({ keyFilter: 'icmpping', nameFilter: '' });
  });

  it('trata texto livre como filtro de nome', () => {
    expect(statusItemSearch('ICMP ping')).toEqual({ keyFilter: '', nameFilter: 'ICMP ping' });
  });
});

describe('parseProblems', () => {
  it('casa o host pelo hostid e ignora severidade abaixo de Warning', () => {
    const summary = parseProblems(
      [
        { name: 'link down', severity: 4, hostid: '1001', objectid: '9' },
        { name: 'info', severity: 1, hostid: '1001', objectid: '8' },
      ],
      ['1001']
    );
    expect(summary['1001']?.count).toBe(1);
    expect(summary['1001']?.maxSeverity).toBe(4);
    expect(summary['1001']?.names).toEqual(['link down']);
  });

  it('sem lista de hostids guarda todos os hosts do problema', () => {
    const summary = parseProblems(
      [{ name: 'link down', severity: 4, hostid: '1001', objectid: '9' }],
      []
    );
    expect(summary['1001']?.count).toBe(1);
  });
});

describe('fetchProblems', () => {
  it('consulta problem.get pelos hostids e não chama trigger.get quando o hostid já veio', async () => {
    const methods: string[] = [];
    let params: ZabbixParams | undefined;
    const summary = await fetchProblems(
      'ds',
      ['1001'],
      async (_uid, method, next) => {
        methods.push(method);
        if (method === 'problem.get') {
          params = next;
          return [{ name: 'link down', severity: 4, hostid: '1001', objectid: '9' }] as never;
        }
        throw new Error(method);
      }
    );
    expect(methods).toEqual(['problem.get']);
    expect(params?.hostids).toEqual(['1001']);
    expect(params).not.toHaveProperty('selectHosts');
    expect(params).not.toHaveProperty('groupids');
    expect(summary['1001']?.count).toBe(1);
  });

  it('sem hostid no problem.get busca o host no event.get', async () => {
    const methods: string[] = [];
    const summary = await fetchProblems(
      'ds',
      [],
      async (_uid, method, next) => {
        methods.push(method);
        if (method === 'problem.get') {
          expect(next).not.toHaveProperty('selectHosts');
          return [{ name: 'link down', severity: 4, objectid: '9', eventid: '99' }] as never;
        }
        if (method === 'event.get') {
          expect(next.selectHosts).toEqual(['hostid']);
          expect(next.eventids).toEqual(['99']);
          return [{ eventid: '99', hosts: [{ hostid: '1001' }] }] as never;
        }
        throw new Error(method);
      },
      ['10']
    );
    expect(methods).toEqual(['problem.get', 'event.get']);
    expect(summary['1001']?.count).toBe(1);
  });

  it('se o event.get não trouxer host cai no trigger.get', async () => {
    const methods: string[] = [];
    const summary = await fetchProblems(
      'ds',
      [],
      async (_uid, method) => {
        methods.push(method);
        if (method === 'problem.get') {
          return [{ name: 'link down', severity: 4, objectid: '9', eventid: '99' }] as never;
        }
        if (method === 'event.get') {
          return [{ eventid: '99' }] as never;
        }
        if (method === 'trigger.get') {
          return [{ triggerid: '9', status: 0, hosts: [{ hostid: '1001' }] }] as never;
        }
        throw new Error(method);
      },
      ['10']
    );
    expect(methods).toEqual(['problem.get', 'event.get', 'trigger.get']);
    expect(summary['1001']?.count).toBe(1);
  });

  it('consulta problem.get pelos groupids quando não há hostids', async () => {
    let params: ZabbixParams | undefined;
    const summary = await fetchProblems(
      'ds',
      [],
      async (_uid, method, next) => {
        if (method === 'problem.get') {
          params = next;
          return [{ name: 'link down', severity: 4, hostid: '1001', objectid: '9' }] as never;
        }
        throw new Error(method);
      },
      ['10']
    );
    expect(params?.groupids).toEqual(['10']);
    expect(params).not.toHaveProperty('hostids');
    expect(summary['1001']?.count).toBe(1);
  });
});

describe('fetchDirectMetadata', () => {
  it('casa o grupo do host sem distinguir maiúsculas e guarda o nome configurado', async () => {
    const meta = await fetchDirectMetadata(
      'ds',
      ['Backbone'],
      undefined,
      fakeCall({
        'hostgroup.get': [{ groupid: '10', name: 'backbone' }],
        'host.get': [
          {
            hostid: '1',
            host: 'host-a',
            name: 'host-a',
            hostgroups: [{ name: 'backbone' }],
            interfaces: [{ ip: '10.0.0.1', main: '1' }],
          },
        ],
      })
    );
    expect(meta.resolvedGroups).toEqual(['Backbone']);
    expect(meta.hosts[0]?.groups).toEqual(['Backbone']);
  });
});

describe('fetchStatusLastValues', () => {
  it('guarda lastvalue 0 quando a API devolve número', async () => {
    const items = await fetchStatusLastValues(
      'ds',
      'icmpping',
      ['10001'],
      [],
      fakeCall({
        'item.get': [
          { itemid: '10', key_: 'icmpping', hostid: '10001', lastvalue: 0, lastclock: 1700 },
        ],
      })
    );
    expect(items[0]?.lastvalue).toBe('0');
    expect(items[0]?.lastclock).toBe('1700');
  });
});

describe('fetchTrafficLastValues', () => {
  it('parte itemids grandes em mais de um item.get', async () => {
    const itemids: string[][] = [];
    const ids = Array.from({ length: ZABBIX_ITEM_GET_BATCH + 1 }, (_, i) => String(10000 + i));
    const fetched = await fetchTrafficLastValues(
      'ds',
      ids,
      [],
      [],
      async (_uid, method, params) => {
        if (method !== 'item.get') {
          throw new Error(method);
        }
        const batch = (params.itemids as string[]) ?? [];
        itemids.push(batch);
        return batch.map((itemid) => ({
          itemid,
          key_: 'vendor.metric.rx[10]',
          hostid: '1',
          lastvalue: '1',
        })) as never;
      }
    );
    expect(itemids).toHaveLength(2);
    expect(itemids[0]).toHaveLength(ZABBIX_ITEM_GET_BATCH);
    expect(itemids[1]).toEqual([ids[ids.length - 1]]);
    expect(fetched.lastValues[ids[0]]?.lastvalue).toBe('1');
    expect(fetched.lastValues[ids[ids.length - 1]]?.lastvalue).toBe('1');
  });
});

describe('fetchHostInterfaceItems', () => {
  it('não consulta host.get quando falta hostid', async () => {
    const methods: string[] = [];
    const entries = await fetchHostInterfaceItems(
      'ds',
      [{ hostKey: 'host-a' }],
      ['vendor.metric.rx'],
      async (_uid, method) => {
        methods.push(method);
        return [] as never;
      }
    );
    expect(entries).toEqual([]);
    expect(methods).toEqual([]);
  });

  it('filtra itens que não casam com a palavra-chave', async () => {
    const entries = await fetchHostInterfaceItems(
      'ds',
      [{ hostKey: 'host-a', hostid: '10001' }],
      ['vendor.metric.rx'],
      fakeCall({
        'item.get': [
          {
            itemid: '10',
            key_: 'vendor.metric.rx[10]',
            name: 'port-a',
            hostid: '10001',
            lastvalue: '1',
          },
          {
            itemid: '11',
            key_: 'other.metric[10]',
            name: 'skip',
            hostid: '10001',
            lastvalue: '2',
          },
        ],
      })
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.items).toHaveLength(1);
    expect(entries[0]?.items[0]?.itemid).toBe('10');
  });
});

describe('fetchHostGroupNames', () => {
  it('lista nomes únicos e ordenados', async () => {
    await expect(
      fetchHostGroupNames(
        'ds',
        fakeCall({
          'hostgroup.get': [
            { groupid: '10', name: 'Backbone' },
            { groupid: '11', name: 'Borda' },
            { groupid: '12', name: 'Backbone' },
          ],
        })
      )
    ).resolves.toEqual(['Backbone', 'Borda']);
  });
});

describe('fetchItemNames', () => {
  it('lista nomes de item do primeiro grupo com resultado', async () => {
    await expect(
      fetchItemNames(
        'ds',
        ['Backbone'],
        fakeCall({
          'hostgroup.get': [{ groupid: '10', name: 'Backbone' }],
          'item.get': [{ name: 'Status item' }, { name: 'Status item' }],
        })
      )
    ).resolves.toEqual(['Status item']);
  });
});

describe('runZabbixPing', () => {
  it('executa o script e complementa com ICMP', async () => {
    dropPingScriptCache();
    const methods: string[] = [];
    const result = await runZabbixPing('ds', '10001', 'panel', async (_uid, method) => {
      methods.push(method);
      if (method === 'script.get') {
        return [{ scriptid: '7', name: 'Ping rápido' }] as never;
      }
      if (method === 'script.execute') {
        return { response: 'success', value: '64 bytes' } as never;
      }
      if (method === 'item.get') {
        return [{ key_: 'icmpping', lastvalue: '1', lastclock: '1000' }] as never;
      }
      throw new Error(method);
    });
    expect(result).toMatchObject({ success: true, output: '64 bytes' });
    expect(methods).toEqual(['script.get', 'script.execute', 'item.get']);
    dropPingScriptCache();
  });
});
