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
  hoverByHost: {
    'host-a': { points: [{ t: 1, value: 0.2 }], metric: 'icmp_rtt' as const, fieldLabel: 'rtt', failureCount: 0 },
  },
};

describe('zabbixSnapshotCache', () => {
  it('devolve o snapshot enquanto o TTL não expira', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, payload, 1_000);
    const hit = readZabbixSnapshot(key, 1_000 + ZABBIX_SNAPSHOT_TTL_MS - 1);
    expect(hit?.hosts[0]?.hostid).toBe('1');
    expect(hit?.lastValues['10']?.lastvalue).toBe('1');
    expect(hit?.hoverByHost?.['host-a']?.points).toHaveLength(1);
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

  it('sobrevive a um reload relendo o localStorage, sem a série do hover', () => {
    clearZabbixSnapshotCache();
    const key = zabbixSnapshotCacheKey('ds', ['Backbone'], 'icmpping');
    writeZabbixSnapshot(key, payload, 1_000);
    dropZabbixSnapshotMemory();
    const hit = readZabbixSnapshot(key, 2_000);
    expect(hit?.statusItems[0]?.lastvalue).toBe('1');
    expect(hit?.hoverByHost).toBeUndefined();
  });
});
