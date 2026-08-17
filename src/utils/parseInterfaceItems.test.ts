import { describe, expect, it } from 'vitest';
import { parseZabbixInterfaceItems } from './zabbixAdapter/parseInterfaceItems';
import { TopologyNetworkInterface } from '../types';

describe('parseZabbixInterfaceItems', () => {
  it('agrupa RX, TX e oper status por interface', () => {
    const interfaces = parseZabbixInterfaceItems('10.0.0.1', '10001', [
      { itemid: '1', key_: 'net.if.in[ether1]', hostid: '10001' },
      { itemid: '2', key_: 'net.if.out[ether1]', hostid: '10001' },
      { itemid: '3', key_: 'net.if.status[ifOperStatus.10]', hostid: '10001', lastvalue: '1' },
      { itemid: '4', key_: 'net.if.speed[ifSpeed.10]', hostid: '10001', lastvalue: '10000000000' },
    ]);
    expect(interfaces).toHaveLength(2);
    const ether1 = interfaces.find((i: TopologyNetworkInterface) => i.name === 'ether1');
    expect(ether1?.metrics.rx?.itemId).toBe('1');
    expect(ether1?.metrics.tx?.itemId).toBe('2');
    expect(ether1?.bindingConfidence).toBe('high');
  });
});
