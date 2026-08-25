import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { resolveZabbixItemIdsByKeys } from './zabbixApi';

describe('resolveZabbixItemIdsByKeys', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('devolve itemid numérico por chave exata e ignora id sintético', async () => {
    post.mockResolvedValueOnce({
      result: [
        { itemid: '77', key_: 'vendor.metric.rx[10]', hostid: '10001' },
        { itemid: '10001:vendor.metric.tx[10]', key_: 'vendor.metric.tx[10]', hostid: '10001' },
      ],
    });

    const resolved = await resolveZabbixItemIdsByKeys(
      'ds',
      ['vendor.metric.rx[10]', 'vendor.metric.tx[10]'],
      undefined,
      ['10001']
    );
    expect(post).toHaveBeenCalledWith(
      '/api/datasources/uid/ds/resources/zabbix-api',
      {
        method: 'item.get',
        params: {
          output: ['itemid', 'key_', 'hostid'],
          filter: { key_: ['vendor.metric.rx[10]', 'vendor.metric.tx[10]'] },
          hostids: ['10001'],
        },
      },
      expect.objectContaining({ showErrorAlert: false })
    );
    expect(resolved.get('10001:vendor.metric.rx[10]')).toBe('77');
    expect(resolved.has('vendor.metric.rx[10]')).toBe(false);
    expect(resolved.has('vendor.metric.tx[10]')).toBe(false);
  });

  it('guarda um itemid por host quando a mesma chave existe em dois hosts', async () => {
    post.mockResolvedValueOnce({
      result: [
        { itemid: '10', key_: 'vendor.metric.rx[10]', hostid: '10001' },
        { itemid: '20', key_: 'vendor.metric.rx[10]', hostid: '10002' },
      ],
    });

    const resolved = await resolveZabbixItemIdsByKeys(
      'ds',
      ['vendor.metric.rx[10]'],
      undefined,
      ['10001', '10002']
    );
    expect(resolved.get('10001:vendor.metric.rx[10]')).toBe('10');
    expect(resolved.get('10002:vendor.metric.rx[10]')).toBe('20');
    expect(resolved.has('vendor.metric.rx[10]')).toBe(false);
  });
});
