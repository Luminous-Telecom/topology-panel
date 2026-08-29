import { describe, expect, it, vi } from 'vitest';
import {
  catalogFromSnapshot,
  clearZabbixSnapshotCache,
  dropZabbixSnapshotMemory,
  persistZabbixItemIdCatalog,
  readZabbixItemIdCatalog,
  zabbixSnapshotCacheKey,
  ZABBIX_ITEMID_CATALOG_TTL_MS,
} from './zabbixSnapshotCache';

const payload = {
  statusItems: [{ itemid: '10001', hostid: '1', key_: 'icmpping', lastvalue: '1' }],
  lastValues: { '1:vendor.metric.rx[10]': { itemid: '77', lastvalue: '1' } },
  interfaceItems: [],
};

describe('zabbixSnapshotCache', () => {
  it('grava o catálogo de itemids sem lastvalue', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    persistZabbixItemIdCatalog(key, payload, 1_000);
    const catalog = readZabbixItemIdCatalog(key, 1_000);
    expect(catalog?.statusItems[0]?.itemid).toBe('10001');
    expect(catalog?.statusItems[0]?.lastvalue).toBeUndefined();
    expect(catalog?.itemIdByKey['1:vendor.metric.rx[10]']).toBe('77');
    expect(catalogFromSnapshot(payload)?.itemIdByKey['1:vendor.metric.rx[10]']).toBe('77');
  });

  it('sobrevive a um reload relendo o localStorage', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    persistZabbixItemIdCatalog(key, payload, 1_000);
    dropZabbixSnapshotMemory();
    expect(readZabbixItemIdCatalog(key, 2_000)?.statusItems[0]?.itemid).toBe('10001');
  });

  it('grava a chave do localStorage sem NUL (sobrevive ao restart do Grafana)', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    persistZabbixItemIdCatalog(key, payload, 1_000);
    const storedKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const stored = localStorage.key(i);
      if (stored?.startsWith('luminous-topology.zabbixItemIds.v1:')) {
        storedKeys.push(stored);
      }
    }
    expect(storedKeys).toHaveLength(1);
    expect(storedKeys[0]?.includes('\u0000')).toBe(false);
  });

  it('ainda grava depois de quota: limpa chaves antigas e tenta de novo', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    const originalSetItem = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function setItem(this: Storage, name: string, value: string) {
      calls += 1;
      if (calls === 1) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return originalSetItem.call(this, name, value);
    };
    try {
      persistZabbixItemIdCatalog(key, payload, 1_000);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
    dropZabbixSnapshotMemory();
    expect(readZabbixItemIdCatalog(key, 2_000)?.statusItems[0]?.itemid).toBe('10001');
  });

  it('expira o catálogo de itemids depois do TTL longo', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    persistZabbixItemIdCatalog(key, payload, 1_000);
    dropZabbixSnapshotMemory();
    expect(readZabbixItemIdCatalog(key, 1_000 + ZABBIX_ITEMID_CATALOG_TTL_MS)).toBeUndefined();
  });

  it('não regrava o catálogo quando os itemids não mudaram', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    persistZabbixItemIdCatalog(key, payload, 1_000);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    persistZabbixItemIdCatalog(key, payload, 2_000);
    const catalogWrites = spy.mock.calls.filter(([name]) =>
      String(name).includes('luminous-topology.zabbixItemIds.v1:')
    );
    spy.mockRestore();
    expect(catalogWrites).toHaveLength(0);
  });

  it('não grava catálogo sem itens de status', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    persistZabbixItemIdCatalog(key, { ...payload, statusItems: [] }, 1_000);
    expect(readZabbixItemIdCatalog(key, 1_000)).toBeUndefined();
  });
});
