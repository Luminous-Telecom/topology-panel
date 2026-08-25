import { describe, expect, it } from 'vitest';
import { TopologyNetworkInterface } from '../../types';
import {
  interfacesShareIdentity,
  matchDiscoveredInterface,
  overlayEndpointSignal,
  resolveInterfaceCapacityMbps,
  resolveLinkCapacityMbps,
} from './bindInterfaceMetrics';

function iface(partial: Partial<TopologyNetworkInterface>): TopologyNetworkInterface {
  return {
    hostKey: 'host-a',
    name: 'eth0',
    metrics: {},
    bindingConfidence: 'medium',
    ...partial,
  };
}

describe('bindInterfaceMetrics — capacidade', () => {
  it('usa speedMbps do item Zabbix quando disponível', () => {
    expect(resolveInterfaceCapacityMbps(iface({ speedMbps: 10000 }))).toBe(10000);
  });

  it('infere capacidade de rótulo com padrão GE', () => {
    expect(resolveInterfaceCapacityMbps(iface({ name: '100GE port-a' }))).toBe(100000);
  });

  it('usa o menor valor entre origem e destino', () => {
    const from = iface({ speedMbps: 10000 });
    const to = iface({ speedMbps: 1000 });
    expect(resolveLinkCapacityMbps(from, to)).toBe(1000);
  });
});

describe('bindInterfaceMetrics — identidade e sinal', () => {
  it('reconhece a mesma porta por token no nome mesmo com SNMP index diferente', () => {
    expect(
      interfacesShareIdentity({ name: 'port-a0/0/3 - host-a' }, { name: 'optical rx port-a0/0/3' })
    ).toBe(true);
    expect(interfacesShareIdentity({ name: 'port-a0/0/3' }, { name: 'port-b0/0/1' })).toBe(false);
  });

  it('casa a interface salva com a descoberta pelo token de porta', () => {
    const found = matchDiscoveredInterface(
      { name: 'port-a0/0/3 - host-a', snmpIndex: '33' },
      [iface({ name: 'optical rx port-a0/0/3', snmpIndex: '99', rxPowerDbm: -8.5 })]
    );
    expect(found?.rxPowerDbm).toBe(-8.5);
  });

  it('completa o sinal do endpoint a partir do inventário', () => {
    const overlaid = overlayEndpointSignal(
      { rxBps: 1000 },
      { name: 'port-a0/0/3 - host-a', snmpIndex: '33' },
      [iface({ name: 'optical rx port-a0/0/3', snmpIndex: '99', rxPowerDbm: -8.5, txPowerDbm: -2 })]
    );
    expect(overlaid.rxBps).toBe(1000);
    expect(overlaid.rxPowerDbm).toBe(-8.5);
    expect(overlaid.txPowerDbm).toBe(-2);
  });
});
