import { afterEach, describe, expect, it } from 'vitest';
import type { ZabbixRpc } from './zabbixCall';
import { dropIcmpHistoryCache, fetchHostIcmpHistory, ICMP_HISTORY_TREND_AFTER_SEC } from './zabbixIcmpHistory';

function callWith(handlers: Record<string, unknown>): ZabbixRpc {
  return async (_uid, method) => {
    if (method in handlers) {
      return handlers[method] as never;
    }
    throw new Error(method);
  };
}

describe('fetchHostIcmpHistory', () => {
  afterEach(() => {
    dropIcmpHistoryCache();
  });

  it('busca history.get no intervalo curto e converte RTT para ms', async () => {
    const methods: string[] = [];
    const history = await fetchHostIcmpHistory(
      'ds',
      '1001',
      100,
      200,
      async (_uid, method) => {
        methods.push(method);
        if (method === 'item.get') {
          return [
            { itemid: '11', key_: 'icmppingsec', lastvalue: '0.012', lastclock: '150', value_type: '0' },
            { itemid: '12', key_: 'icmppingloss', lastvalue: '2', lastclock: '150', value_type: '0' },
          ] as never;
        }
        if (method === 'history.get') {
          return [
            { clock: '110', value: '0.01' },
            { clock: '120', value: '0.02' },
          ] as never;
        }
        throw new Error(method);
      }
    );
    expect(methods.filter((method) => method === 'history.get')).toHaveLength(2);
    expect(methods).not.toContain('trend.get');
    expect(history.status.rttMs).toBe(12);
    expect(history.status.lossPct).toBe(2);
    expect(history.rttMs[0]?.value).toBe(10);
    expect(history.lossPct[0]?.value).toBe(0.01);
  });

  it('usa trend.get quando o intervalo do dashboard é longo', async () => {
    const methods: string[] = [];
    const from = 1;
    const till = from + ICMP_HISTORY_TREND_AFTER_SEC + 10;
    await fetchHostIcmpHistory(
      'ds',
      '1001',
      from,
      till,
      async (_uid, method) => {
        methods.push(method);
        if (method === 'item.get') {
          return [{ itemid: '11', key_: 'icmppingsec', lastvalue: '0.01', value_type: '0' }] as never;
        }
        if (method === 'trend.get') {
          return [{ clock: '20', value_avg: '0.03' }] as never;
        }
        throw new Error(method);
      }
    );
    expect(methods).toContain('trend.get');
    expect(methods).not.toContain('history.get');
  });

  it('intervalo inválido não consulta a API', async () => {
    const call = callWith({});
    const history = await fetchHostIcmpHistory('ds', '1001', 200, 100, call);
    expect(history.rttMs).toEqual([]);
    expect(history.lossPct).toEqual([]);
  });
});
