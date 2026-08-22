import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
}));

import { fetchZabbixHostProblems } from './zabbixApi';

describe('fetchZabbixHostProblems', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('guarda nome e severidade do problema Warning+ por host', async () => {
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      if (body.method === 'problem.get') {
        return {
          result: [
            { eventid: '51', severity: '4', name: 'Interface down' },
            { eventid: '52', severity: '2', name: 'ICMP timeout' },
            { eventid: '53', severity: '1', name: 'Info only' },
          ],
        };
      }
      if (body.method === 'event.get') {
        return {
          result: [
            { eventid: '51', hosts: [{ hostid: '1001' }] },
            { eventid: '52', hosts: [{ hostid: '1001' }] },
            { eventid: '53', hosts: [{ hostid: '1001' }] },
          ],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const summary = await fetchZabbixHostProblems('ds', ['1001']);
    expect(summary['1001']?.count).toBe(2);
    expect(summary['1001']?.maxSeverity).toBe(4);
    expect(summary['1001']?.names).toEqual(['Interface down', 'ICMP timeout']);
    const problemCall = post.mock.calls.find(([, body]) => body.method === 'problem.get');
    expect(problemCall?.[1]?.params?.output).toContain('name');
  });
});
