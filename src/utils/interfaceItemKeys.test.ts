import { describe, expect, it } from 'vitest';
import { parseInterfaceItemKey, extractInterfaceTokenFromKey } from './zabbixAdapter/interfaceItemKeys';

describe('interfaceItemKeys', () => {
  it('classifica net.if.in com nome de interface', () => {
    const parsed = parseInterfaceItemKey('net.if.in[ether1]');
    expect(parsed?.kind).toBe('rx');
    expect(parsed?.interfaceToken).toBe('ether1');
  });

  it('classifica ifHCInOctets com SNMP index', () => {
    const parsed = parseInterfaceItemKey('net.if.in[ifHCInOctets.42]');
    expect(parsed?.kind).toBe('rx');
    expect(parsed?.snmpIndex).toBe('42');
  });

  it('classifica oper status', () => {
    const parsed = parseInterfaceItemKey('net.if.status[ifOperStatus.5]');
    expect(parsed?.kind).toBe('operStatus');
    expect(parsed?.snmpIndex).toBe('5');
  });

  it('extrai token entre colchetes', () => {
    expect(extractInterfaceTokenFromKey('net.if.out[GigabitEthernet0/0/1]')).toBe('GigabitEthernet0/0/1');
  });
});
