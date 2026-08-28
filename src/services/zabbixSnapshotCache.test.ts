import { describe, expect, it } from 'vitest';
import {
  clearZabbixSnapshotCache,
  dropZabbixSnapshotMemory,
  readZabbixSnapshot,
  writeZabbixSnapshot,
  zabbixSnapshotCacheKey,
  ZABBIX_SNAPSHOT_TTL_MS,
} from './zabbixSnapshotCache';

const payload = {
  datasourceUid: 'ds',
  groupNames: ['Backbone'],
  statusItemKey: 'icmpping',
  hosts: [{ hostid: '1', host: 'host-a', name: 'host-a', groups: ['Backbone'] }],
  statusItems: [{ itemid: 'i1', hostid: '1', key_: 'icmpping', lastvalue: '1' }],
  lastValues: { '10': { itemid: '10', lastvalue: '1' } },
  interfaceItems: [],
  problems: {},
};

describe('zabbixSnapshotCache', () => {
  it('devolve o snapshot enquanto o TTL não expira', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, payload, 1_000);
    const hit = readZabbixSnapshot(key, 1_000 + ZABBIX_SNAPSHOT_TTL_MS - 1);
    expect(hit?.hosts[0]?.hostid).toBe('1');
    expect(hit?.lastValues['10']?.lastvalue).toBe('1');
  });

  it('expira depois do TTL', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, payload, 1_000);
    expect(readZabbixSnapshot(key, 1_000 + ZABBIX_SNAPSHOT_TTL_MS)).toBeUndefined();
  });

  it('não grava snapshot sem hosts ou sem itens de status', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, { ...payload, hosts: [] }, 1_000);
    expect(readZabbixSnapshot(key, 1_000)).toBeUndefined();
    writeZabbixSnapshot(key, { ...payload, statusItems: [] }, 1_000);
    expect(readZabbixSnapshot(key, 1_000)).toBeUndefined();
  });

  it('sobrevive a um reload relendo o localStorage', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, payload, 1_000);
    dropZabbixSnapshotMemory();
    const hit = readZabbixSnapshot(key, 2_000);
    expect(hit?.statusItems[0]?.lastvalue).toBe('1');
  });

  it('grava a chave do localStorage sem NUL (sobrevive ao restart do Grafana)', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, payload, 1_000);
    const storedKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const stored = localStorage.key(i);
      if (stored?.startsWith('luminous-topology.zabbixSnapshot.v2:')) {
        storedKeys.push(stored);
      }
    }
    expect(storedKeys).toHaveLength(1);
    expect(storedKeys[0]?.includes('\u0000')).toBe(false);
  });

  it('ainda grava depois de quota: limpa snapshots antigos e tenta de novo', () => {
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
      writeZabbixSnapshot(key, payload, 1_000);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
    dropZabbixSnapshotMemory();
    expect(readZabbixSnapshot(key, 2_000)?.hosts[0]?.hostid).toBe('1');
  });
});
