import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { fetchZabbixHostInterfaceItems } from './zabbixApi';

describe('fetchZabbixHostInterfaceItems', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('busca só as chaves informadas, com string e sem selectTags', async () => {
    post.mockImplementation(async (_url: string, body: { method: string; params?: { hostids?: string[]; search?: { key_?: unknown }; selectTags?: unknown } }) => {
      if (body.method === 'item.get') {
        return {
          result: [
            {
              itemid: '21',
              hostid: '10001',
              key_: 'vendor.metric.rx[14]',
              name: 'item-name-rx-a',
            },
          ],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const entries = await fetchZabbixHostInterfaceItems(
      'ds',
      ['10.0.0.1', 'host-a'],
      ['vendor.metric.rx', 'vendor.metric.tx', 'vendor.metric.oper', 'vendor.metric.speed'],
      {
        '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '10001' },
        'host-a': { name: 'host-a', ip: '10.0.0.1', hostid: '10001' },
      }
    );

    const itemCalls = post.mock.calls.filter(([, body]) => body.method === 'item.get');
    expect(itemCalls).toHaveLength(4);
    expect(itemCalls.map(([, body]) => body.params?.search?.key_).sort()).toEqual([
      'vendor.metric.oper',
      'vendor.metric.rx',
      'vendor.metric.speed',
      'vendor.metric.tx',
    ]);
    expect(itemCalls.every(([, body]) => body.params?.selectTags === undefined)).toBe(true);
    expect(itemCalls[0]?.[1].params?.hostids).toEqual(['10001']);
    expect(entries[0]?.items).toHaveLength(1);
    expect(entries[0]?.hostid).toBe('10001');
  });

  it('não chama a API quando as chaves de busca estão vazias', async () => {
    const entries = await fetchZabbixHostInterfaceItems('ds', ['10.0.0.1'], []);
    expect(entries).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('resolve host por IP com searchInterfaces quando não há metadata', async () => {
    post.mockImplementation(async (_url: string, body: { method: string; params?: { searchInterfaces?: { ip?: string }; hostids?: string[] } }) => {
      if (body.method === 'host.get' && body.params?.searchInterfaces?.ip === '10.0.0.1') {
        return { result: [{ hostid: '10001', host: 'host-a', name: 'host-a' }] };
      }
      if (body.method === 'item.get') {
        return {
          result: [{ itemid: '8', hostid: '10001', key_: 'vendor.metric.rx[1]', name: 'item-name-rx-a' }],
        };
      }
      if (body.method === 'host.get') {
        return { result: [] };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const entries = await fetchZabbixHostInterfaceItems('ds', ['10.0.0.1'], ['vendor.metric.rx']);
    expect(entries[0]?.hostid).toBe('10001');
    expect(entries[0]?.items).toHaveLength(1);
    expect(
      post.mock.calls.some(
        ([, body]) => body.method === 'host.get' && body.params?.searchInterfaces?.ip === '10.0.0.1'
      )
    ).toBe(true);
  });
});
