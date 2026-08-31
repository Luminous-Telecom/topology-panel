import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPluginLicense, fetchLiveSnapshot, encodeSnapshotKey, PLUGIN_RESOURCES } from './pluginBackend';

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

  it('fetchLiveSnapshot manda a chave e o host do Grafana', async () => {
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
    await fetchLiveSnapshot('ds\u0000Backbone\u0000icmpping', 'grafana.example');
    const request = subscribe.mock.calls[0][0] as {
      url: string;
      params?: { key?: string; host?: string };
    };
    expect(request.url).toBe(`${PLUGIN_RESOURCES}/snapshot`);
    expect(request.params?.host).toBe('grafana.example');
    expect(request.params?.key).toBe(encodeSnapshotKey('ds\u0000Backbone\u0000icmpping'));
  });
});
