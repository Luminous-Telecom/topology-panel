import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({
    getInstanceSettings: () => ({ jsonData: {} }),
  }),
}));

import { fetchZabbixSignalInventory, fetchZabbixTrafficLastValues, resolveZabbixItemIdsByKeys } from './zabbixApi';

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

  it('manda a lista inteira de itemids num item.get só, sem fatiar', async () => {
    const ids = Array.from({ length: 750 }, (_, index) => String(1000 + index));
    post.mockResolvedValueOnce({ result: [] });

    await fetchZabbixTrafficLastValues('ds', ids);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual({
      method: 'item.get',
      params: {
        itemids: ids,
        output: ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'],
      },
    });
  });

  it('não mistura sinal no item.get de tráfego', async () => {
    post.mockResolvedValueOnce({ result: [] });

    await fetchZabbixTrafficLastValues('ds', ['10'], undefined, [], ['10001']);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ method: 'item.get', params: { itemids: ['10'] } });
  });
});

describe('fetchZabbixSignalInventory', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('faz um item.get por termo, em paralelo', async () => {
    post.mockResolvedValue({ result: [] });

    await fetchZabbixSignalInventory('ds', ['10001'], ['rxpower', 'txpower', 'optical']);

    // Um `search` só com os três termos leva mais que o dobro do tempo no Zabbix.
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls.map((call) => call[1].params.search.key_)).toEqual(['rxpower', 'txpower', 'optical']);
    expect(post.mock.calls[0][1]).toEqual({
      method: 'item.get',
      params: {
        output: ['itemid', 'key_', 'name', 'hostid', 'lastvalue', 'lastclock'],
        hostids: ['10001'],
        search: { key_: 'rxpower' },
      },
    });
  });

  it('devolve os itens encontrados para o cabo escolher', async () => {
    post.mockResolvedValueOnce({
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

    const items = await fetchZabbixSignalInventory('ds', ['10001'], ['rxpower']);

    expect(items).toHaveLength(1);
    expect(items[0]?.itemid).toBe('30');
    expect(items[0]?.lastvalue).toBe('-8.5');
  });

  it('não chama a API sem host ou sem termo', async () => {
    expect(await fetchZabbixSignalInventory('ds', [], ['rxpower'])).toEqual([]);
    expect(await fetchZabbixSignalInventory('ds', ['10001'], [])).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });
});
