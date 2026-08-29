import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { fetchHostIcmpStatus } from './zabbixApi/ping';

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
