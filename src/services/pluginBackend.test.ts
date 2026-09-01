import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPluginLicense,
  fetchLiveSnapshot,
  fetchBackendPoll,
  fetchBackendHostGroups,
  fetchBackendItemNames,
  fetchBackendHostInterfaces,
  fetchBackendPing,
  encodeSnapshotKey,
  PLUGIN_RESOURCES,
} from './pluginBackend';

const subscribe = vi.hoisted(() => vi.fn());

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({
    fetch: (request: unknown) => ({
      subscribe: (handlers: { next: (value: unknown) => void; error: (err: unknown) => void }) => {
        subscribe(request, handlers);
      },
    }),
  }),
}));

describe('pluginBackend', () => {
  afterEach(() => {
    subscribe.mockReset();
  });

  it('encodeSnapshotKey é base64url sem padding', () => {
    expect(encodeSnapshotKey('ds\u0000Backbone\u0000icmpping')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeSnapshotKey('a')).toBe('YQ');
  });

  it('fetchPluginLicense aceita valid do backend Go', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({
          data: { valid: true, storeVersion: '1.9.0', grafanaIp: '203.0.113.10' },
        });
      }
    );
    await expect(fetchPluginLicense('203.0.113.10')).resolves.toEqual({
      status: 'valid',
      storeVersion: '1.9.0',
      grafanaIp: '203.0.113.10',
    });
    const request = subscribe.mock.calls[0][0] as { url: string; params?: { host?: string } };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/license`);
    expect(request.params).toEqual({ host: '203.0.113.10' });
  });

  it('fetchPluginLicense bloqueia quando o backend não está no ar', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { error: (err: unknown) => void }) => {
        handlers.error({ status: 404 });
      }
    );
    const result = await fetchPluginLicense();
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.retryable).toBe(true);
      expect(result.message).toMatch(/backend/);
    }
  });

  it('fetchLiveSnapshot lê o lastvalue no POST /snapshot com a chave no corpo', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({
          data: {
            savedAt: 10,
            metadata: { hosts: [], resolvedGroups: ['Backbone'], groupIds: ['10'] },
            knownStatusItems: [],
            lastValues: {},
            interfaceItems: [],
            problems: {},
          },
        });
      }
    );
    await fetchLiveSnapshot('ds\u0000Backbone\u0000icmpping');
    const request = subscribe.mock.calls[0][0] as {
      url: string;
      method?: string;
      data?: { key?: string };
    };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/snapshot`);
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({
      key: encodeSnapshotKey('ds\u0000Backbone\u0000icmpping'),
    });
    expect(request).not.toHaveProperty('abortSignal');
  });

  it('fetchBackendPoll consulta POST /poll com a configuração do painel', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({
          data: {
            ready: true,
            loading: false,
            snapshot: {
              savedAt: 10,
              metadata: { hosts: [], resolvedGroups: ['Backbone'], groupIds: ['10'] },
              knownStatusItems: [],
              lastValues: {},
              interfaceItems: [],
              problems: {},
            },
          },
        });
      }
    );
    await fetchBackendPoll({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      trafficItemIds: [],
      trafficKeys: [],
      refreshSec: 30,
    });
    const request = subscribe.mock.calls[0][0] as {
      url: string;
      method?: string;
      data?: Record<string, unknown>;
    };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/poll`);
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      trafficItemIds: [],
      trafficKeys: [],
      refreshSec: 30,
    });
  });

  it('fetchBackendHostGroups consulta POST /groups', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({ data: { groups: ['Backbone'] } });
      }
    );
    await expect(fetchBackendHostGroups('ds')).resolves.toEqual(['Backbone']);
    const request = subscribe.mock.calls[0][0] as { url: string; method?: string; data?: unknown };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/groups`);
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({ datasourceUid: 'ds' });
  });

  it('fetchBackendItemNames consulta POST /item-names', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({ data: { names: ['Status item'] } });
      }
    );
    await expect(fetchBackendItemNames('ds', ['Backbone'])).resolves.toEqual(['Status item']);
    const request = subscribe.mock.calls[0][0] as { url: string; data?: unknown };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/item-names`);
    expect(request.data).toEqual({ datasourceUid: 'ds', groupNames: ['Backbone'] });
  });

  it('fetchBackendHostInterfaces consulta POST /interfaces', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({ data: { entries: [{ hostKey: 'host-a', hostid: '10001', items: [] }] } });
      }
    );
    await expect(
      fetchBackendHostInterfaces('ds', [{ hostKey: 'host-a', hostid: '10001' }], ['vendor.metric.rx'])
    ).resolves.toEqual([{ hostKey: 'host-a', hostid: '10001', items: [] }]);
    const request = subscribe.mock.calls[0][0] as { url: string; data?: unknown };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/interfaces`);
  });

  it('fetchBackendPing consulta POST /ping', async () => {
    subscribe.mockImplementation(
      (_request: unknown, handlers: { next: (value: unknown) => void }) => {
        handlers.next({
          data: {
            success: true,
            output: '64 bytes',
            icmp: { reachable: true, lossPct: 0, rttMs: 1 },
          },
        });
      }
    );
    await expect(fetchBackendPing('ds', 'host-a')).resolves.toMatchObject({
      success: true,
      output: '64 bytes',
    });
    const request = subscribe.mock.calls[0][0] as { url: string; data?: unknown };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/ping`);
    expect(request.data).toEqual({ datasourceUid: 'ds', hostName: 'host-a', mode: 'panel' });
  });
});
