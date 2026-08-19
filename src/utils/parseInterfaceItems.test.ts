import { describe, expect, it } from 'vitest';
import { parseZabbixInterfaceItems } from './zabbixAdapter/parseInterfaceItems';
import { TopologyNetworkInterface } from '../types';

describe('parseZabbixInterfaceItems', () => {
  const hostKey = 'switch-a';

  it('agrupa RX, TX e oper status por interface', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10001', [
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

  it('agrupa itens com index numerico por tag e nome do item', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10002', [
      {
        itemid: '1',
        key_: 'vendor.metric.rx[10]',
        name: 'RX GigabitEthernet0/0/4 uplink',
        hostid: '10002',
        tags: [{ tag: 'interface GigabitEthernet0/0/4 uplink', value: '' }],
      },
      {
        itemid: '2',
        key_: 'vendor.metric.tx[10]',
        name: 'TX GigabitEthernet0/0/4 uplink',
        hostid: '10002',
      },
      {
        itemid: '3',
        key_: 'operstatus[10]',
        name: 'Oper status GigabitEthernet0/0/4 uplink',
        hostid: '10002',
        lastvalue: '1',
      },
    ]);
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]?.name).toBe('GigabitEthernet0/0/4 uplink');
    expect(interfaces[0]?.snmpIndex).toBe('10');
    expect(interfaces[0]?.metrics.rx?.itemId).toBe('1');
    expect(interfaces[0]?.metrics.tx?.itemId).toBe('2');
    expect(interfaces[0]?.metrics.operStatus?.itemId).toBe('3');
  });

  it('extrai rótulo legível de nome com barras e substitui index numerico', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10003', [
      {
        itemid: '10',
        key_: 'adminstatus.v[255]',
        name: 'Admin Status / 100GE0/5/0.1010 / peer-z',
        hostid: '10003',
      },
      {
        itemid: '11',
        key_: 'vendor.metric.rx.v[255]',
        name: 'RX / 100GE0/5/0.1010 / peer-z',
        hostid: '10003',
      },
      {
        itemid: '12',
        key_: 'vendor.metric.tx.v[255]',
        name: 'TX / 100GE0/5/0.1010 / peer-z',
        hostid: '10003',
      },
    ]);
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]?.name).toBe('100GE0/5/0.1010 / peer-z');
    expect(interfaces[0]?.snmpIndex).toBe('255');
  });

  it('converte lastvalue de modulação em speedMbps', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10004', [
      {
        itemid: '20',
        key_: 'modulacao[10]',
        name: 'Modulation GigabitEthernet0/0/4',
        hostid: '10004',
        lastvalue: '10000000000',
      },
    ]);
    expect(interfaces[0]?.speedMbps).toBe(10000);
  });
});
