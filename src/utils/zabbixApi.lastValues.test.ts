import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { fetchHostIcmpStatus, fetchZabbixItemLastValues } from './zabbixApi';

describe('fetchZabbixItemLastValues', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('busca todos os itemids numa chamada só, sem history.get', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => String(i + 1));
    post.mockImplementation(async (_url: string, body: { method: string; params: { itemids?: string[] } }) => {
      if (body.method === 'item.get') {
        return {
          result: (body.params.itemids ?? []).map((itemid) => ({
            itemid,
            lastvalue: '100',
            lastclock: '1000',
            value_type: '3',
          })),
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const values = await fetchZabbixItemLastValues('ds', ids);

    expect(Object.keys(values)).toHaveLength(120);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('usa o lastvalue do item.get como valor corrente', async () => {
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      if (body.method === 'item.get') {
        return {
          result: [{ itemid: '10', lastvalue: '100', lastclock: '1000', value_type: '3' }],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const values = await fetchZabbixItemLastValues('ds', ['10']);
    expect(values['10']?.lastvalue).toBe('100');
    expect(values['10']?.lastclock).toBe('1000');
  });
});

describe('fetchHostIcmpStatus', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('lê perda, RTT e alcance do lastvalue dos itens ICMP', async () => {
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      if (body.method === 'host.get') {
        return { result: [{ hostid: '1' }] };
      }
      if (body.method === 'item.get') {
        return {
          result: [
            { itemid: 'p', key_: 'icmpping', lastvalue: '0', lastclock: '2000', value_type: '3' },
            { itemid: 's', key_: 'icmppingsec', lastvalue: '0', lastclock: '2000', value_type: '0' },
          ],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const status = await fetchHostIcmpStatus('ds', 'sw-core');
    expect(status.reachable).toBe(false);
    expect(status.rttMs).toBe(0);
    expect(status.lastClock).toBe(2000);
  });
});
