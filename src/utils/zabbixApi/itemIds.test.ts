import { describe, expect, it } from 'vitest';
import { itemIdByKeyFromLastValues, mergeItemIdByKey, zabbixHostItemKey } from './itemIds';

describe('itemIdByKeyFromLastValues', () => {
  it('só indexa entradas hostid:key com itemid numérico', () => {
    const next = itemIdByKeyFromLastValues({
      '10': { itemid: '10' },
      '1:vendor.metric.rx[10]': { itemid: '77' },
      '2:vendor.metric.rx[10]': { itemid: 'not-an-id' },
    });
    expect(next.get('1:vendor.metric.rx[10]')).toBe('77');
    expect(next.has('10')).toBe(false);
    expect(next.has('2:vendor.metric.rx[10]')).toBe(false);
  });
});

describe('mergeItemIdByKey', () => {
  it('grava hostid:key a partir dos itens do item.get', () => {
    const into = new Map<string, string>();
    mergeItemIdByKey(into, [
      { itemid: '77', hostid: '1', key_: 'vendor.metric.rx[10]' },
      { itemid: 'x', hostid: '1', key_: 'vendor.metric.tx[10]' },
    ]);
    expect(into.get(zabbixHostItemKey('1', 'vendor.metric.rx[10]'))).toBe('77');
    expect(into.size).toBe(1);
  });
});
