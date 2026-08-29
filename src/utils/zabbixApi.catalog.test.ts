import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({ getInstanceSettings: () => undefined }),
}));

import { fetchZabbixHostInterfaceItems, fetchZabbixItemNames, fetchZabbixProblems } from './zabbixApi';

describe('fetchZabbixProblems', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('chama problem.get pelos groupids e faz o join de host via trigger.get', async () => {
    post
      .mockResolvedValueOnce({
        result: [{ eventid: '1', objectid: '2001', name: 'Interface down', severity: '4' }],
      })
      .mockResolvedValueOnce({
        result: [{ triggerid: '2001', hosts: [{ hostid: '1001' }] }],
      });

    const summary = await fetchZabbixProblems('ds', ['1001'], ['10']);

    expect(post.mock.calls[0][1]).toEqual({
      method: 'problem.get',
      params: {
        output: ['eventid', 'objectid', 'name', 'severity'],
        groupids: ['10'],
        severities: [2, 3, 4, 5],
        source: 0,
        object: 0,
        recent: false,
        suppressed: false,
        limit: 1001,
      },
    });
    expect(post.mock.calls[1][1]).toEqual({
      method: 'trigger.get',
      params: {
        triggerids: ['2001'],
        output: ['triggerid', 'status'],
        filter: { status: 0 },
        selectHosts: ['hostid'],
      },
    });
    expect(summary['1001']?.count).toBe(1);
    expect(summary['1001']?.names).toEqual(['Interface down']);
  });

  it('ignora problema cujo trigger está desabilitado', async () => {
    post
      .mockResolvedValueOnce({
        result: [{ eventid: '1', objectid: '2001', name: 'Interface down', severity: '4' }],
      })
      .mockResolvedValueOnce({
        result: [{ triggerid: '2001', status: '1', hosts: [{ hostid: '1001' }] }],
      });

    expect(await fetchZabbixProblems('ds', ['1001'], ['10'])).toEqual({});
  });

  it('não chama trigger.get quando problem.get volta vazio', async () => {
    post.mockResolvedValueOnce({ result: [] });
    expect(await fetchZabbixProblems('ds', ['1001'], ['10'])).toEqual({});
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1].method).toBe('problem.get');
  });

  it('não chama a API sem hostid ou sem groupid', async () => {
    expect(await fetchZabbixProblems('ds', [], ['10'])).toEqual({});
    expect(await fetchZabbixProblems('ds', ['1001'], [])).toEqual({});
    expect(post).not.toHaveBeenCalled();
  });
});

describe('fetchZabbixHostInterfaceItems', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('busca por hostid e termo, filtra a key no cliente', async () => {
    post.mockResolvedValueOnce({
      result: [
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
    });

    const entries = await fetchZabbixHostInterfaceItems(
      'ds',
      [{ hostKey: 'host-a', hostid: '10001' }],
      ['vendor.metric.rx']
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({
      method: 'item.get',
      params: {
        hostids: ['10001'],
        search: { key_: 'vendor.metric.rx' },
      },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.items.map((item) => item.itemid)).toEqual(['10']);
  });

  it('sem hostid numérico resolve o host por nome e depois busca os itens', async () => {
    post
      .mockResolvedValueOnce({ result: [] })
      .mockResolvedValueOnce({ result: [{ hostid: '10001' }] })
      .mockResolvedValueOnce({
        result: [
          {
            itemid: '10',
            key_: 'vendor.metric.rx[10]',
            name: 'port-a',
            hostid: '10001',
            lastvalue: '1',
          },
        ],
      });

    const entries = await fetchZabbixHostInterfaceItems(
      'ds',
      [{ hostKey: 'host-a', hostid: '' }],
      ['vendor.metric.rx']
    );

    expect(post.mock.calls[0][1].method).toBe('host.get');
    expect(post.mock.calls[0][1].params.filter).toMatchObject({ name: ['host-a'] });
    expect(post.mock.calls[1][1].method).toBe('host.get');
    expect(post.mock.calls[1][1].params.filter).toMatchObject({ host: ['host-a'] });
    expect(post.mock.calls[2][1].method).toBe('item.get');
    expect(entries[0]?.items.map((item) => item.itemid)).toEqual(['10']);
  });

  it('sem hostid e sem host no Zabbix não chama item.get', async () => {
    post.mockResolvedValue({ result: [] });
    const entries = await fetchZabbixHostInterfaceItems('ds', [{ hostKey: 'host-a', hostid: '' }], [
      'vendor.metric.rx',
    ]);
    expect(entries).toEqual([]);
    expect(post.mock.calls.every((call) => call[1].method === 'host.get')).toBe(true);
    expect(post.mock.calls.some((call) => call[1].method === 'item.get')).toBe(false);
  });
});

describe('fetchZabbixItemNames', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('lista nomes únicos do primeiro grupo que responder', async () => {
    post.mockImplementation(async (_url: string, body: { method: string; params: { groupids?: string[] } }) => {
      if (body.method === 'hostgroup.get') {
        return {
          result: [
            { groupid: '1', name: 'Backbone' },
            { groupid: '2', name: 'Borda' },
          ],
        };
      }
      if (body.method === 'item.get' && body.params.groupids?.[0] === '1') {
        return { result: [{ name: 'Status item' }, { name: 'Status item' }] };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const names = await fetchZabbixItemNames('ds', ['Backbone', 'Borda']);

    expect(names).toEqual(['Status item']);
    const itemGets = post.mock.calls.filter((call) => call[1].method === 'item.get');
    expect(itemGets).toHaveLength(1);
    expect(itemGets[0]?.[1].params).toMatchObject({
      groupids: ['1'],
      output: ['name'],
      monitored: true,
    });
  });
});
