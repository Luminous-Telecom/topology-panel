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
        { itemid: '77', key_: 'vendor.metric.rx[10]' },
        { itemid: '10001:vendor.metric.tx[10]', key_: 'vendor.metric.tx[10]' },
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
          output: ['itemid', 'key_'],
          filter: { key_: ['vendor.metric.rx[10]', 'vendor.metric.tx[10]'] },
          hostids: ['10001'],
        },
      },
      expect.objectContaining({ showErrorAlert: false })
    );
    expect(resolved.get('vendor.metric.rx[10]')).toBe('77');
    expect(resolved.has('vendor.metric.tx[10]')).toBe(false);
  });
});
