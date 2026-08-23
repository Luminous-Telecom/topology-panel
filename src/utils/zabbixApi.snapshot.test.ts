import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({ post }),
  getDataSourceSrv: () => ({ getInstanceSettings: () => undefined }),
}));

import { fetchZabbixDirectMetadata, fetchZabbixStatusItems, STATUS_CALL_MAX_ATTEMPTS } from './zabbixApi';

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

describe('fetchZabbixStatusItems', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('traz o status de todos os hosts numa única item.get por groupids', async () => {
    post.mockImplementation(async (_url: string, body: ApiBody) => {
      expect(body.method).toBe('item.get');
      expect(body.params.groupids).toEqual(['1', '2']);
      expect(body.params.search?.key_).toBe('icmppingsec');
      return {
        result: [
          { itemid: '100', hostid: '10', key_: 'icmppingsec', lastvalue: '0.05', lastclock: '1000' },
          { itemid: '101', hostid: '11', key_: 'icmppingsec', lastvalue: '0', lastclock: '1000' },
        ],
      };
    });

    const items = await fetchZabbixStatusItems('ds', ['1', '2'], 'icmppingsec');

    expect(items).toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('não pede history.get — lastvalue e lastclock bastam para o status', async () => {
    post.mockImplementation(async (_url: string, body: ApiBody) => {
      if (body.method === 'item.get') {
        return {
          result: [
            { itemid: '100', hostid: '10', key_: 'icmppingsec', lastvalue: '0', lastclock: '1000' },
          ],
        };
      }
      throw new Error(`método inesperado: ${body.method}`);
    });

    await fetchZabbixStatusItems('ds', ['1'], 'icmppingsec');

    expect(post.mock.calls.some(([, body]) => (body as ApiBody).method === 'history.get')).toBe(false);
  });

  it('pede só os campos que o índice consome', async () => {
    post.mockResolvedValue({ result: [] });

    await fetchZabbixStatusItems('ds', ['1'], 'icmppingsec');

    const [, body] = post.mock.calls[0] as [string, ApiBody];
    expect(body.params.output).toEqual(['itemid', 'hostid', 'key_', 'lastvalue', 'lastclock']);
  });

  it('repete a chamada instável antes de desistir', async () => {
    let attempts = 0;
    post.mockImplementation(async () => {
      attempts += 1;
      if (attempts < STATUS_CALL_MAX_ATTEMPTS) {
        throw new Error('network error');
      }
      return {
        result: [
          { itemid: '100', hostid: '10', key_: 'icmppingsec', lastvalue: '0.05', lastclock: '1000' },
        ],
      };
    });

    const items = await fetchZabbixStatusItems('ds', ['1'], 'icmppingsec');

    expect(attempts).toBe(STATUS_CALL_MAX_ATTEMPTS);
    expect(items).toHaveLength(1);
  });

  it('propaga a falha em vez de devolver status vazio quando esgota as tentativas', async () => {
    post.mockRejectedValue(new Error('boom'));

    await expect(fetchZabbixStatusItems('ds', ['1'], 'icmppingsec')).rejects.toThrow(
      'Falha ao consultar itens de status no Zabbix.'
    );
  });
});
