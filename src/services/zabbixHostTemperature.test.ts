import { afterEach, describe, expect, it } from 'vitest';
import type { ZabbixRpc } from './zabbixCall';
import { dropHostTemperatureCache, fetchHostTemperatures } from './zabbixHostTemperature';

describe('fetchHostTemperatures', () => {
  afterEach(() => {
    dropHostTemperatureCache();
  });

  it('busca lastvalue de temperatura por hostid e filtra o que não é sensor', async () => {
    let called: { method: string; params: unknown } | undefined;
    const call: ZabbixRpc = async (_uid, method, params) => {
      called = { method, params };
      return [
        { itemid: '11', name: 'CPU', key_: 'sensor.temp[cpu]', lastvalue: '51', units: '°C' },
        { itemid: '12', name: 'Template', key_: 'vendor.template.info', lastvalue: '1' },
      ] as never;
    };
    const readings = await fetchHostTemperatures('ds-a', '1001', call);
    expect(called).toEqual({
      method: 'item.get',
      params: expect.objectContaining({
        hostids: ['1001'],
        search: { key_: 'temp', name: 'temp' },
        searchByAny: true,
      }),
    });
    expect(readings).toEqual([
      expect.objectContaining({ itemId: '11', label: 'CPU', value: 51, units: '°C' }),
    ]);
  });

  it('sem hostid numérico não consulta o Zabbix', async () => {
    let calls = 0;
    const call: ZabbixRpc = async () => {
      calls += 1;
      return [] as never;
    };
    await expect(fetchHostTemperatures('ds-a', 'host-a', call)).resolves.toEqual([]);
    expect(calls).toBe(0);
  });
});
