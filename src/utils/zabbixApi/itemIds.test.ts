import { describe, expect, it } from 'vitest';
import {
  itemIdByKeyFromLastValues,
  mergeItemIdByKey,
  sameLastValuesForPaint,
  sameStatusItemsLastValue,
  zabbixHostItemKey,
} from './itemIds';

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

describe('sameLastValuesForPaint', () => {
  it('ignora lastclock quando itemid e lastvalue são iguais', () => {
    expect(
      sameLastValuesForPaint(
        { '10': { itemid: '10', lastvalue: '1', lastclock: '1000' } },
        { '10': { itemid: '10', lastvalue: '1', lastclock: '2000' } }
      )
    ).toBe(true);
  });

  it('detecta lastvalue diferente', () => {
    expect(
      sameLastValuesForPaint(
        { '10': { itemid: '10', lastvalue: '1' } },
        { '10': { itemid: '10', lastvalue: '0' } }
      )
    ).toBe(false);
  });

  it('detecta chave nova', () => {
    expect(
      sameLastValuesForPaint({ '10': { itemid: '10', lastvalue: '1' } }, {
        '10': { itemid: '10', lastvalue: '1' },
        '11': { itemid: '11', lastvalue: '1' },
      })
    ).toBe(false);
  });
});

describe('sameStatusItemsLastValue', () => {
  it('ignora lastclock quando o lastvalue de status é o mesmo', () => {
    expect(
      sameStatusItemsLastValue(
        [{ itemid: '10001', lastvalue: '1' }],
        [{ itemid: '10001', lastvalue: '1' }]
      )
    ).toBe(true);
  });

  it('detecta host que mudou de status', () => {
    expect(
      sameStatusItemsLastValue(
        [{ itemid: '10001', lastvalue: '1' }],
        [{ itemid: '10001', lastvalue: '0' }]
      )
    ).toBe(false);
  });
});
