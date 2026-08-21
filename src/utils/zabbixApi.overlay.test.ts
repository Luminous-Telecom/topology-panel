import { describe, expect, it } from 'vitest';
import { overlayStatusItemLastValue, ZabbixInterfaceItem } from './zabbixApi';

function item(overrides?: Partial<ZabbixInterfaceItem>): ZabbixInterfaceItem {
  return {
    itemid: '42',
    key_: 'icmppingsec',
    lastvalue: '0.000663',
    lastclock: '100',
    hostid: '10',
    ...overrides,
  };
}

describe('overlayStatusItemLastValue', () => {
  it('usa o ponto mais novo do histórico no lugar do lastvalue atrasado', () => {
    const next = overlayStatusItemLastValue(item(), { clockSec: 200, value: 0 });
    expect(next.lastvalue).toBe('0');
    expect(next.lastclock).toBe('200');
  });

  it('mantém o lastvalue quando o histórico é mais antigo', () => {
    const current = item({ lastclock: '300', lastvalue: '0.0008' });
    const next = overlayStatusItemLastValue(current, { clockSec: 200, value: 0 });
    expect(next).toBe(current);
  });

  it('no mesmo clock, prefere o valor do histórico (Down/Up do hover)', () => {
    const next = overlayStatusItemLastValue(item({ lastclock: '200' }), { clockSec: 200, value: 0 });
    expect(next.lastvalue).toBe('0');
  });

  it('sem ponto de histórico, devolve o item intacto', () => {
    const current = item();
    expect(overlayStatusItemLastValue(current, undefined)).toBe(current);
  });
});
