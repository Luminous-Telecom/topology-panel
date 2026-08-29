import { describe, expect, it } from 'vitest';
import { parseInterfaceItemKey, extractInterfaceTokenFromKey, itemMatchesInterfaceKeywords } from './zabbixAdapter/interfaceItemKeys';

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

  it('classifica tráfego em key pontilhada sem colchetes', () => {
    expect(parseInterfaceItemKey('rx.port.19.1')).toEqual({
      kind: 'rx',
      interfaceToken: 'port.19.1',
    });
    expect(parseInterfaceItemKey('tx.port.20.1')).toEqual({
      kind: 'tx',
      interfaceToken: 'port.20.1',
    });
    expect(parseInterfaceItemKey('rxpower.port.1')).toBeUndefined();
    expect(parseInterfaceItemKey('cpu.slot.1')).toBeUndefined();
  });

  it('classifica sinal óptico/rádio e não confunde com tráfego', () => {
    expect(parseInterfaceItemKey('vendor.optical.rxpower[10]')).toEqual({
      kind: 'rxPower',
      interfaceToken: '10',
      snmpIndex: '10',
    });
    expect(parseInterfaceItemKey('vendor.optical.txpower[11]')?.kind).toBe('txPower');
    expect(parseInterfaceItemKey('vendor.sinal.rx[12]')?.kind).toBe('rxPower');
    expect(parseInterfaceItemKey('vendor.rssi[13]')?.kind).toBe('rxPower');
    expect(parseInterfaceItemKey('vendor.metric.rx[10]')?.kind).toBe('rx');
  });

  it('usa palavras-chave de sinal configuradas quando os padrões não reconhecem a key', () => {
    const opts = {
      rxPowerKeyword: 'customrxpwr',
      txPowerKeyword: 'customtxpwr',
    };
    expect(parseInterfaceItemKey('vendor.customrxpwr.uplink[eth0]', opts)?.kind).toBe('rxPower');
    expect(parseInterfaceItemKey('vendor.customtxpwr.uplink[eth0]', opts)?.kind).toBe('txPower');
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

  it('casa palavra-chave na key ou nome, e key pontilhada de tráfego', () => {
    expect(itemMatchesInterfaceKeywords('vendor.metric.rx[10]', 'port-a', ['vendor.metric.rx'])).toBe(true);
    expect(itemMatchesInterfaceKeywords('other.metric[10]', 'skip', ['vendor.metric.rx'])).toBe(false);
    expect(itemMatchesInterfaceKeywords('rx.port.1.1', undefined, ['nope'])).toBe(true);
  });
});
