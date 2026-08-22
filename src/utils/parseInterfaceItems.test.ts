import { describe, expect, it } from 'vitest';
import { parseZabbixInterfaceItems, pickHostInterfaces } from './zabbixAdapter/parseInterfaceItems';
import { TopologyNetworkInterface } from '../types';

describe('parseZabbixInterfaceItems', () => {
  const hostKey = 'host-a';

  it('agrupa RX, TX e oper status por interface', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10001', [
      { itemid: '1', key_: 'net.if.in[port-a]', hostid: '10001' },
      { itemid: '2', key_: 'net.if.out[port-a]', hostid: '10001' },
      { itemid: '3', key_: 'net.if.status[ifOperStatus.10]', hostid: '10001', lastvalue: '1' },
      { itemid: '4', key_: 'net.if.speed[ifSpeed.10]', hostid: '10001', lastvalue: '10000000000' },
    ]);
    expect(interfaces).toHaveLength(2);
    const portA = interfaces.find((i: TopologyNetworkInterface) => i.name === 'port-a');
    expect(portA?.metrics.rx?.itemId).toBe('1');
    expect(portA?.metrics.tx?.itemId).toBe('2');
    expect(portA?.bindingConfidence).toBe('high');
  });

  it('agrupa itens com index numerico e usa o name do item', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10002', [
      {
        itemid: '1',
        key_: 'vendor.metric.rx[10]',
        name: 'item-name-rx-a',
        hostid: '10002',
      },
      {
        itemid: '2',
        key_: 'vendor.metric.tx[10]',
        name: 'item-name-tx-a',
        hostid: '10002',
      },
      {
        itemid: '3',
        key_: 'operstatus[10]',
        name: 'item-name-status-a extra',
        hostid: '10002',
        lastvalue: '1',
      },
    ]);
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]?.name).toBe('item-name-status-a extra');
    expect(interfaces[0]?.snmpIndex).toBe('10');
    expect(interfaces[0]?.metrics.rx?.itemId).toBe('1');
    expect(interfaces[0]?.metrics.tx?.itemId).toBe('2');
    expect(interfaces[0]?.metrics.operStatus?.itemId).toBe('3');
  });

  it('usa o name do item sem recortar barras nem prefixo', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10003', [
      {
        itemid: '10',
        key_: 'adminstatus.v[255]',
        name: 'item-name-admin-a / port-a / alias-b',
        hostid: '10003',
      },
      {
        itemid: '11',
        key_: 'vendor.metric.rx.v[255]',
        name: 'item-name-rx-a / port-a / alias-b',
        hostid: '10003',
      },
      {
        itemid: '12',
        key_: 'vendor.metric.tx.v[255]',
        name: 'item-name-tx-a / port-a / alias-b',
        hostid: '10003',
      },
    ]);
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]?.name).toBe('item-name-admin-a / port-a / alias-b');
    expect(interfaces[0]?.snmpIndex).toBe('255');
  });

  it('converte lastvalue de velocidade em speedMbps', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10004', [
      {
        itemid: '20',
        key_: 'modulacao[10]',
        name: 'item-name-speed-a',
        hostid: '10004',
        lastvalue: '10000000000',
      },
    ]);
    expect(interfaces[0]?.name).toBe('item-name-speed-a');
    expect(interfaces[0]?.speedMbps).toBe(10000);
  });

  it('mostra o name do item exatamente como veio', () => {
    const itemName = 'item-name-rx-a port-a alias-b';
    const interfaces = parseZabbixInterfaceItems(hostKey, '10007', [
      {
        itemid: '1',
        key_: 'vendor.metric.rx[16]',
        name: itemName,
        hostid: '10007',
      },
      {
        itemid: '2',
        key_: 'vendor.metric.tx[16]',
        name: 'item-name-tx-a port-a alias-b',
        hostid: '10007',
      },
    ]);
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]?.name).toBe(itemName);
    expect(interfaces[0]?.snmpIndex).toBe('16');
  });

  it('agrupa keys SNMP pontuadas sem colchetes', () => {
    const interfaces = parseZabbixInterfaceItems(hostKey, '10005', [
      { itemid: '1', key_: 'ifHCInOctets.14', name: 'item-name-rx-a', hostid: '10005' },
      { itemid: '2', key_: 'ifHCOutOctets.14', name: 'item-name-tx-a', hostid: '10005' },
    ]);
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]?.name).toBe('item-name-rx-a');
    expect(interfaces[0]?.snmpIndex).toBe('14');
    expect(interfaces[0]?.metrics.rx?.itemId).toBe('1');
    expect(interfaces[0]?.metrics.tx?.itemId).toBe('2');
  });
});

describe('pickHostInterfaces', () => {
  it('devolve a primeira lista não vazia entre as chaves candidatas', () => {
    const iface = parseZabbixInterfaceItems('host-a', '1', [
      { itemid: '1', key_: 'net.if.in[port-a]', hostid: '1' },
    ])[0];
    expect(iface).toBeDefined();
    if (!iface) {
      return;
    }
    const byHost = {
      '10.0.0.1': [],
      'host-a': [iface],
    };
    expect(pickHostInterfaces(byHost, ['10.0.0.1', 'host-a'])).toEqual([iface]);
  });

  it('devolve lista vazia quando nenhuma chave tem interfaces', () => {
    expect(pickHostInterfaces({ '10.0.0.1': [] }, ['10.0.0.1', 'host-a'])).toEqual([]);
  });
});
