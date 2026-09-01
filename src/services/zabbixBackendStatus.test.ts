import { describe, expect, it } from 'vitest';
import {
  compactSubmapHostsForBackend,
  hostsFromBackendRows,
  httpStatusFromError,
  statusItemsFromBackendRows,
} from './zabbixBackendStatus';

describe('hostsFromBackendRows', () => {
  it('monta o host direto a partir da linha compacta', () => {
    expect(
      hostsFromBackendRows([
        { hostId: '1', host: 'host-a', name: 'Host A', ip: '10.0.0.1', groups: ['Backbone'] },
      ])
    ).toEqual([{ hostid: '1', host: 'host-a', name: 'Host A', ip: '10.0.0.1', groups: ['Backbone'] }]);
  });
});

describe('statusItemsFromBackendRows', () => {
  it('ignora host sem itemId', () => {
    const items = statusItemsFromBackendRows(
      [
        { hostId: '1', host: 'a', name: 'a', groups: [], itemId: '10001', lastvalue: '1' },
        { hostId: '2', host: 'b', name: 'b', groups: [] },
      ],
      'icmpping'
    );
    expect(items).toEqual([
      { itemid: '10001', key_: 'icmpping', hostid: '1', lastvalue: '1', lastclock: undefined },
    ]);
  });
});

describe('compactSubmapHostsForBackend', () => {
  it('separa lista resolvida de mapa indisponível', () => {
    const compact = compactSubmapHostsForBackend({
      ok: ['10.0.0.1'],
      failed: null,
      pending: undefined,
    });
    expect(compact.submapHosts).toEqual({ ok: ['10.0.0.1'] });
    expect(compact.submapHostsFailed).toEqual(['failed']);
  });
});

describe('httpStatusFromError', () => {
  it('lê status do FetchError do Grafana', () => {
    expect(httpStatusFromError({ status: 404 })).toBe(404);
    expect(httpStatusFromError(new Error('falha'))).toBeUndefined();
  });
});
