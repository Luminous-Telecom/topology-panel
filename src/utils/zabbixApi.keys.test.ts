import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { fetchZabbixTrafficLastValues, resolveZabbixItemIdsByKeys } from './zabbixApi';

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
          output: ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'],
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

describe('fetchZabbixTrafficLastValues', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('lê lastvalue pelo itemid, sem ds.query', async () => {
    post.mockResolvedValueOnce({
      result: [
        {
          itemid: '10',
          key_: 'vendor.metric.rx[10]',
          hostid: '10001',
          lastvalue: '500000000',
          lastclock: '1700',
        },
      ],
    });

    const { lastValues, itemIdByKey } = await fetchZabbixTrafficLastValues('ds', ['10', 'vendor.metric.rx[10]']);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual({
      method: 'item.get',
      params: {
        itemids: ['10'],
        output: ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'],
      },
    });
    expect(lastValues['10']?.lastvalue).toBe('500000000');
    expect(lastValues['10001:vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
    expect(lastValues['vendor.metric.rx[10]']).toBeUndefined();
    expect(itemIdByKey.get('10001:vendor.metric.rx[10]')).toBe('10');
  });

  it('sem itemid nem chave não consulta o Zabbix', async () => {
    const { lastValues } = await fetchZabbixTrafficLastValues('ds', ['vendor.metric.rx[10]'], undefined, []);
    expect(post).not.toHaveBeenCalled();
    expect(lastValues).toEqual({});
  });

  it('busca lastvalue pela chave quando o cabo não tem itemid', async () => {
    post.mockResolvedValueOnce({
      result: [
        {
          itemid: '77',
          key_: 'vendor.metric.rx[10]',
          hostid: '10001',
          lastvalue: '42',
        },
      ],
    });

    const { lastValues } = await fetchZabbixTrafficLastValues('ds', [], undefined, ['vendor.metric.rx[10]'], [
      '10001',
    ]);

    expect(post.mock.calls[0][1]).toEqual({
      method: 'item.get',
      params: {
        output: ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'],
        filter: { key_: ['vendor.metric.rx[10]'] },
        hostids: ['10001'],
      },
    });
    expect(lastValues['77']?.lastvalue).toBe('42');
    expect(lastValues['10001:vendor.metric.rx[10]']?.lastvalue).toBe('42');
  });

  it('busca sinal no mesmo ciclo do tráfego e devolve os itens para o cabo', async () => {
    post
      .mockResolvedValueOnce({
        result: [
          {
            itemid: '10',
            key_: 'vendor.metric.rx[10]',
            name: 'port-a',
            hostid: '10001',
            lastvalue: '500000000',
            lastclock: '1700',
          },
        ],
      })
      .mockResolvedValueOnce({
        result: [
          {
            itemid: '30',
            key_: 'vendor.optical.rxpower[10]',
            name: 'port-a',
            hostid: '10001',
            lastvalue: '-8.5',
            lastclock: '1700',
          },
        ],
      });

    const { lastValues, interfaceItems } = await fetchZabbixTrafficLastValues(
      'ds',
      ['10'],
      undefined,
      [],
      undefined,
      { hostids: ['10001'], terms: ['optical'] }
    );

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({
      method: 'item.get',
      params: {
        output: ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'],
        hostids: ['10001'],
        search: { key_: 'optical' },
      },
    });
    expect(lastValues['10']?.lastvalue).toBe('500000000');
    expect(lastValues['30']?.lastvalue).toBe('-8.5');
    expect(interfaceItems.some((item) => item.itemid === '30' && item.lastvalue === '-8.5')).toBe(true);
  });

  it('consulta sinal mesmo sem itemid de tráfego', async () => {
    post.mockResolvedValueOnce({
      result: [
        {
          itemid: '30',
          key_: 'vendor.optical.rxpower[10]',
          name: 'port-a',
          hostid: '10001',
          lastvalue: '-8.5',
        },
      ],
    });

    const { lastValues, interfaceItems } = await fetchZabbixTrafficLastValues(
      'ds',
      [],
      undefined,
      [],
      undefined,
      { hostids: ['10001'], terms: ['rssi'] }
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(lastValues['30']?.lastvalue).toBe('-8.5');
    expect(interfaceItems[0]?.itemid).toBe('30');
  });
});
