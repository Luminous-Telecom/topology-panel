import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPluginLicense, PLUGIN_RESOURCES } from './pluginBackend';

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
});
