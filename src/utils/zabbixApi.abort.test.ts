import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({ getInstanceSettings: () => undefined }),
}));

import { fetchZabbixDirectMetadata } from './zabbixApi';

describe('cancelamento de requisições Zabbix', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('passa abortSignal e requestId estável para o BackendSrv', async () => {
    post.mockResolvedValue({ result: [] });

    await fetchZabbixDirectMetadata('ds', ['Backbone']);

    expect(post).toHaveBeenCalledTimes(1);
    const [, , options] = post.mock.calls[0] as [string, unknown, { abortSignal?: AbortSignal; requestId?: string }];
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.requestId).toBe('topology-groups-ds');
  });

  it('interrompe a chamada quando o AbortSignal externo dispara', async () => {
    post.mockImplementation(
      (_url: string, _body: unknown, options: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.abortSignal?.addEventListener('abort', () => reject(new Error('Request was aborted')), {
            once: true,
          });
        })
    );

    const controller = new AbortController();
    const pending = fetchZabbixDirectMetadata('ds', ['Backbone'], controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow(/abort/i);
  });
});
