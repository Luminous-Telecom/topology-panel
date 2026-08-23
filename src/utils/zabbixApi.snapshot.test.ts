import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({ getInstanceSettings: () => undefined }),
}));

import { fetchZabbixDirectMetadata } from './zabbixApi';

interface ApiBody {
  method: string;
  params: { groupids?: string[]; hostids?: string[]; output?: string[]; search?: { key_?: string } };
}

describe('fetchZabbixDirectMetadata', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('resolve grupos e hosts sem tocar em item.get', async () => {
    post.mockImplementation(async (_url: string, body: ApiBody) => {
      if (body.method === 'hostgroup.get') {
        return { result: [{ groupid: '1', name: 'Backbone' }] };
      }
      if (body.method === 'host.get') {
        return {
          result: [
            {
              hostid: '10',
              host: 'host-a',
              name: 'host-a',
              hostgroups: [{ name: 'Backbone' }],
              interfaces: [{ ip: '10.0.0.1', main: '1', type: '1' }],
            },
          ],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const metadata = await fetchZabbixDirectMetadata('ds', ['Backbone']);

    expect(metadata.resolvedGroups).toEqual(['Backbone']);
    expect(metadata.groupIds).toEqual(['1']);
    expect(metadata.hosts).toHaveLength(1);
    expect(metadata.hosts[0].ip).toBe('10.0.0.1');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('casa o grupo do submapa sem distinguir maiúsculas e devolve o nome do Zabbix', async () => {
    post.mockImplementation(async (_url: string, body: ApiBody) => {
      if (body.method === 'hostgroup.get') {
        return { result: [{ groupid: '1', name: 'Backbone' }, { groupid: '2', name: 'Borda' }] };
      }
      if (body.method === 'host.get') {
        return {
          result: [
            {
              hostid: '10',
              host: 'host-a',
              name: 'host-a',
              hostgroups: [{ name: 'Backbone' }],
            },
          ],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const metadata = await fetchZabbixDirectMetadata('ds', ['BACKBONE']);

    expect(metadata.resolvedGroups).toEqual(['Backbone']);
    expect(metadata.groupIds).toEqual(['1']);
    expect(metadata.hosts).toHaveLength(1);
  });

  it('devolve grupos vazios quando nenhum grupo configurado existe', async () => {
    post.mockImplementation(async (_url: string, body: ApiBody) => {
      if (body.method === 'hostgroup.get') {
        return { result: [] };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    const metadata = await fetchZabbixDirectMetadata('ds', ['Inexistente']);

    expect(metadata.resolvedGroups).toEqual([]);
    expect(metadata.hosts).toEqual([]);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
