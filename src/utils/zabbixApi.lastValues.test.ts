import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
}));

import { fetchHostIcmpStatus, fetchZabbixItemLastValues } from './zabbixApi';

describe('fetchZabbixItemLastValues', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('substitui lastvalue atrasado pelo ponto mais novo do history.get, igual ao status dos hosts', async () => {
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      if (body.method === 'item.get') {
        return {
          result: [{ itemid: '10', lastvalue: '100', lastclock: '1000', value_type: '3' }],
        };
      }
      if (body.method === 'history.get') {
        return {
          result: [{ itemid: '10', clock: '2000', value: '999' }],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const values = await fetchZabbixItemLastValues('ds', ['10']);
    expect(values['10']?.lastvalue).toBe('999');
    expect(values['10']?.lastclock).toBe('2000');
    expect(post.mock.calls.some(([, body]) => body.method === 'history.get')).toBe(true);
  });

  it('mantém o lastvalue do item.get quando o history.get não volta ponto', async () => {
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      if (body.method === 'item.get') {
        return {
          result: [{ itemid: '10', lastvalue: '100', lastclock: '1000', value_type: '3' }],
        };
      }
      if (body.method === 'history.get') {
        throw new Error('timeout');
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

  it('usa o último ponto do history.get quando o lastvalue do icmppingsec está atrasado', async () => {
    post.mockImplementation(async (_url: string, body: { method: string; params?: { itemids?: string[] } }) => {
      if (body.method === 'host.get') {
        return { result: [{ hostid: '1' }] };
      }
      if (body.method === 'item.get') {
        return {
          result: [
            { itemid: 'p', key_: 'icmpping', lastvalue: '1', lastclock: '1000', value_type: '3' },
            { itemid: 's', key_: 'icmppingsec', lastvalue: '0.0008', lastclock: '1000', value_type: '0' },
          ],
        };
      }
      if (body.method === 'history.get') {
        const ids = body.params?.itemids ?? [];
        const rows: Array<{ itemid: string; clock: string; value: string }> = [];
        if (ids.includes('p')) {
          rows.push({ itemid: 'p', clock: '2000', value: '0' });
        }
        if (ids.includes('s')) {
          rows.push({ itemid: 's', clock: '2000', value: '0' });
        }
        return { result: rows };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const status = await fetchHostIcmpStatus('ds', 'sw-core');
    expect(status.reachable).toBe(false);
    expect(status.rttMs).toBe(0);
    expect(status.lastClock).toBe(2000);
  });
});
