import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { fetchZabbixItemLastValues, resolveZabbixItemIdsByKeys } from './zabbixApi';

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

describe('fetchZabbixItemLastValues', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('indexa lastvalue por itemid e pela key', async () => {
    post.mockResolvedValueOnce({
      result: [
        {
          itemid: '10',
          key_: 'vendor.metric.rx[10]',
          lastvalue: '500000000',
          lastclock: '1700000000',
        },
      ],
    });

    const values = await fetchZabbixItemLastValues('ds', ['10', 'vendor.metric.rx[10]']);
    expect(post).toHaveBeenCalledWith(
      '/api/datasources/uid/ds/resources/zabbix-api',
      {
        method: 'item.get',
        params: {
          itemids: ['10'],
          output: ['itemid', 'key_', 'lastvalue', 'lastclock'],
        },
      },
      expect.objectContaining({ showErrorAlert: false, requestId: 'topology-traffic-lv-ds-0' })
    );
    expect(values['10']?.lastvalue).toBe('500000000');
    expect(values['10']?.lastclock).toBe('1700000000');
    expect(values['vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
  });

  it('sem itemid numérico não chama a API', async () => {
    const values = await fetchZabbixItemLastValues('ds', ['vendor.metric.rx[10]']);
    expect(post).not.toHaveBeenCalled();
    expect(values).toEqual({});
  });

  it('devolve lastvalue zero de item não monitorado', async () => {
    post.mockResolvedValueOnce({
      result: [{ itemid: '10', key_: 'vendor.metric.rx[10]', lastvalue: '0', lastclock: '1700000000' }],
    });

    const values = await fetchZabbixItemLastValues('ds', ['10']);
    expect(post.mock.calls[0][1].params.monitored).toBeUndefined();
    expect(values['10']?.lastvalue).toBe('0');
  });
});
