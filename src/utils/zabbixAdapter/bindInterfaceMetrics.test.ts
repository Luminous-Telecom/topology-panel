import { describe, expect, it } from 'vitest';
import { TopologyNetworkInterface } from '../../types';
import {
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
    expect(resolveInterfaceCapacityMbps(iface({ name: '100GE0/5/0.1010 / peer-z' }))).toBe(100000);
  });

  it('usa o menor valor entre origem e destino', () => {
    const from = iface({ speedMbps: 10000 });
    const to = iface({ speedMbps: 1000 });
    expect(resolveLinkCapacityMbps(from, to)).toBe(1000);
  });
});
