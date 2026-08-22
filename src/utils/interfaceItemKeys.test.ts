import { describe, expect, it } from 'vitest';
import { parseInterfaceItemKey, extractInterfaceTokenFromKey } from './zabbixAdapter/interfaceItemKeys';

describe('interfaceItemKeys', () => {
  it('classifica net.if.in com nome de interface', () => {
    const parsed = parseInterfaceItemKey('net.if.in[port-a]');
    expect(parsed?.kind).toBe('rx');
    expect(parsed?.interfaceToken).toBe('port-a');
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
    expect(extractInterfaceTokenFromKey('net.if.out[port-a]')).toBe('port-a');
  });

  it('classifica item de modulação/velocidade', () => {
    expect(parseInterfaceItemKey('modulacao[10]')?.kind).toBe('speed');
  });

  it('classifica keys custom com sufixos direcionais e status', () => {
    expect(parseInterfaceItemKey('vendor.metric.rx[10]')).toEqual({
      kind: 'rx',
      interfaceToken: '10',
      snmpIndex: '10',
    });
    expect(parseInterfaceItemKey('vendor.metric.tx[11]')?.kind).toBe('tx');
    expect(parseInterfaceItemKey('vendor.metric.rx.v[255]')?.kind).toBe('rx');
    expect(parseInterfaceItemKey('operstatus[12]')?.kind).toBe('operStatus');
    expect(parseInterfaceItemKey('adminstatus[13]')?.kind).toBe('adminStatus');
    expect(parseInterfaceItemKey('vendor.err.in[14]')?.kind).toBe('errors');
  });

  it('ignora protótipos LLD com macros entre colchetes', () => {
    expect(parseInterfaceItemKey('vendor.metric.rx.v[{#SNMPINDEX}]')).toBeUndefined();
  });

  it('classifica keys custom genéricas com sufixo .in/.out', () => {
    expect(parseInterfaceItemKey('vendor.traffic.in[eth0]')?.kind).toBe('rx');
    expect(parseInterfaceItemKey('vendor.traffic.out[eth0]')?.kind).toBe('tx');
  });

  it('classifica keys SNMP pontuadas sem colchetes', () => {
    expect(parseInterfaceItemKey('ifHCInOctets.14')).toEqual({
      kind: 'rx',
      interfaceToken: '14',
      snmpIndex: '14',
    });
    expect(parseInterfaceItemKey('ifHCOutOctets.14')?.kind).toBe('tx');
    expect(parseInterfaceItemKey('ifOperStatus.14')?.kind).toBe('operStatus');
    expect(parseInterfaceItemKey('ifSpeed.14')?.kind).toBe('speed');
    expect(parseInterfaceItemKey('ifHighSpeed.14')?.kind).toBe('speed');
  });

  it('usa palavras-chave configuradas quando os padrões não reconhecem a key', () => {
    const opts = {
      rxKeyword: 'customrx',
      txKeyword: 'customtx',
      operStatusKeyword: 'customoper',
      speedKeyword: 'customspeed',
    };
    expect(parseInterfaceItemKey('vendor.customrx.uplink[eth0]', opts)?.kind).toBe('rx');
    expect(parseInterfaceItemKey('vendor.customtx.uplink[eth0]', opts)?.kind).toBe('tx');
    expect(parseInterfaceItemKey('vendor.customoper.uplink[eth0]', opts)?.kind).toBe('operStatus');
    expect(parseInterfaceItemKey('vendor.customspeed.uplink[eth0]', opts)?.kind).toBe('speed');
  });
});
