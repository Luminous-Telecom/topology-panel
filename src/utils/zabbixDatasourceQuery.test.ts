import { FieldType, LoadingState } from '@grafana/data';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZabbixDirectHost } from './zabbixApi';

const getMock = vi.fn();

vi.mock('@grafana/runtime', () => ({
  getDataSourceSrv: () => ({ get: getMock }),
}));

import {
  STATUS_QUERY_MAX_ATTEMPTS,
  TRAFFIC_QUERY_MAX_POINTS,
  ZABBIX_INTERFACE_ITEM_FILTER,
  ZABBIX_STATUS_QUERY_RANGE_SEC,
  buildZabbixInterfaceTargets,
  buildZabbixProblemsTargets,
  buildZabbixStatusQueryRequest,
  buildZabbixTrafficQueryRequest,
  fetchZabbixHostInterfaceItemsViaQuery,
  parseHoverSeriesFromFrames,
  fetchZabbixHostGroupNamesViaQuery,
  fetchZabbixItemNamesViaQuery,
  fetchZabbixStatusViaQuery,
  ZABBIX_MFQ_GROUPS,
  ZABBIX_MFQ_ITEMS,
  parseInterfaceItemsFromFrames,
  parseItemLastValuesFromFrames,
  parseProblemsFromFrames,
  parseStatusItemsFromFrames,
  zabbixGroupFilter,
  zabbixGroupsFilter,
  zabbixInterfaceHostFilter,
  zabbixItemNameFilter,
  zabbixMetricsItemFilter,
  zabbixStatusItemFilter,
} from './zabbixDatasourceQuery';

function host(overrides: Partial<ZabbixDirectHost> & { hostid: string; name: string }): ZabbixDirectHost {
  return {
    host: overrides.host ?? overrides.name,
    groups: overrides.groups ?? ['Backbone'],
    ...overrides,
  };
}

describe('zabbixGroupFilter', () => {
  it('mantém nome simples como filtro exato', () => {
    expect(zabbixGroupFilter('Backbone')).toBe('Backbone');
  });

  it('ancora nome com metacaractere para não virar glob do Zobnin', () => {
    expect(zabbixGroupFilter('POP*Norte')).toBe('/^POP\\*Norte$/');
  });
});

describe('zabbixGroupsFilter', () => {
  it('com um grupo ancora sem distinguir maiúsculas', () => {
    expect(zabbixGroupsFilter(['Backbone'])).toBe('/^Backbone$/i');
  });

  it('com vários grupos ancora os nomes num único regex', () => {
    expect(zabbixGroupsFilter(['Backbone', 'Borda'])).toBe('/^(?:Backbone|Borda)$/i');
  });

  it('escapa metacaractere quando junta vários grupos', () => {
    expect(zabbixGroupsFilter(['POP*Norte', 'Borda'])).toBe('/^(?:POP\\*Norte|Borda)$/i');
  });
});

describe('zabbixStatusItemFilter', () => {
  function compileFilter(filter: string): RegExp {
    const match = filter.match(/^\/(.*)\/([imncsxrde]*)$/);
    expect(match).toBeTruthy();
    return new RegExp(match![1], match![2]);
  }

  it('casa chave, nome com espaços e forma parametrizada; ignora derivadas', () => {
    const re = compileFilter(zabbixStatusItemFilter('icmpping'));
    expect(re.test('icmpping')).toBe(true);
    expect(re.test('ICMP ping')).toBe(true);
    expect(re.test('icmpping[eth0]')).toBe(true);
    expect(re.test('icmppingloss')).toBe(false);
    expect(re.test('ICMP ping loss')).toBe(false);
  });
});

describe('buildZabbixStatusQueryRequest', () => {
  it('monta um target Metrics com os grupos visíveis, sem cache do Grafana QueryRunner', () => {
    const request = buildZabbixStatusQueryRequest('ds', ['Backbone', 'Borda'], 'icmpping', 30, 1_700_000_000_000);
    expect(request).toBeDefined();
    expect(request?.targets).toHaveLength(1);
    expect(request?.targets[0].queryType).toBe('0');
    expect(request?.targets[0].group?.filter).toBe(zabbixGroupsFilter(['Backbone', 'Borda']));
    expect(request?.targets[0].host?.filter).toBe('/.*/');
    expect(request?.targets[0].item?.filter).toBe(zabbixMetricsItemFilter('icmpping'));
    const named = buildZabbixStatusQueryRequest('ds', ['Backbone'], 'Status item', 30, 1_700_000_000_000);
    expect(named?.targets).toHaveLength(1);
    expect(named?.targets[0].group?.filter).toBe(zabbixGroupsFilter(['Backbone']));
    expect(named?.targets[0].item?.filter).toBe('Status item');
    expect(request?.targets[0].options?.useTrends).toBe('false');
    expect(request?.skipQueryCache).toBe(true);
    expect(request?.queryCachingTTL).toBe(0);
    expect(request?.requestId).toBe('topology-status-ds');
    expect(request?.maxDataPoints).toBe(240);
  });

  it('com itemids monta target Item ID, sem filtro por nome', () => {
    const request = buildZabbixStatusQueryRequest(
      'ds',
      ['Backbone'],
      'icmppingsec',
      30,
      1_700_000_000_000,
      ['100', '101', '100']
    );
    expect(request?.targets).toHaveLength(1);
    expect(request?.targets[0].queryType).toBe('3');
    expect(request?.targets[0].itemids).toBe('100,101');
    expect(request?.targets[0].item).toBeUndefined();
  });

  it('não monta request sem grupos ou chave', () => {
    expect(buildZabbixStatusQueryRequest('ds', [], 'icmpping', 30)).toBeUndefined();
    expect(buildZabbixStatusQueryRequest('ds', ['Backbone'], '  ', 30)).toBeUndefined();
  });
});

describe('buildZabbixTrafficQueryRequest', () => {
  it('monta Item ID numa janela curta, sem misturar com o status', () => {
    const nowMs = 1_700_000_000_000;
    const request = buildZabbixTrafficQueryRequest('ds', ['10', '11'], 30, nowMs);
    expect(request).toBeDefined();
    expect(request?.targets).toHaveLength(1);
    expect(request?.targets[0].queryType).toBe('3');
    expect(request?.targets[0].refId).toBe('T0');
    expect(request?.targets[0].itemids).toBe('10,11');
    expect(request?.requestId).toBe('topology-traffic-ds');
    expect(request?.maxDataPoints).toBe(TRAFFIC_QUERY_MAX_POINTS);
    const spanMs = request ? request.range.to.valueOf() - request.range.from.valueOf() : 0;
    expect(spanMs).toBe(ZABBIX_STATUS_QUERY_RANGE_SEC * 1000);
  });

  it('descarta itemid não numérico em vez de incluir chave de item', () => {
    const request = buildZabbixTrafficQueryRequest(
      'ds',
      ['10', 'vendor.metric.rx[10]', '11'],
      30,
      1_700_000_000_000
    );
    expect(request?.targets[0].itemids).toBe('10,11');
  });

  it('sem nenhum itemid válido não monta request', () => {
    expect(buildZabbixTrafficQueryRequest('ds', ['vendor.metric.rx[10]'], 30)).toBeUndefined();
    expect(buildZabbixTrafficQueryRequest('ds', [], 30)).toBeUndefined();
  });
});

describe('parseStatusItemsFromFrames', () => {
  const hosts = [
    host({ hostid: '10', name: 'host-a', host: 'host-a' }),
    host({ hostid: '11', name: 'host-b', host: 'host-b' }),
  ];

  it('lê o último ponto numérico e casa o host visível com o hostid dos metadados', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          name: 'host-a: ICMP ping',
          fields: [
            { name: 'Time', type: FieldType.time, values: [1_000_000, 2_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [1, 0],
              labels: { host: 'host-a', item_key: 'icmpping' },
              config: {},
            },
          ],
          length: 2,
        },
      ],
      hosts,
      'icmpping'
    );

    expect(items).toHaveLength(1);
    expect(items[0].hostid).toBe('10');
    expect(items[0].key_).toBe('icmpping');
    expect(items[0].lastvalue).toBe('0');
    expect(items[0].lastclock).toBe('2000');
  });

  it('usa __zbx_host_id do custom quando o label não traz hostid', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          fields: [
            { name: 'Time', type: FieldType.time, values: [1_700_000_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [1],
              labels: { host: 'outro-nome', item_key: 'icmpping' },
              config: {
                custom: { scopedVars: { __zbx_host_id: { value: '11' } } },
              },
            },
          ],
          length: 1,
        },
      ],
      hosts,
      'icmpping'
    );

    expect(items[0]?.hostid).toBe('11');
    expect(items[0]?.lastclock).toBe('1700000000');
  });

  it('ignora série sem host resolvido em vez de inventar status', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          fields: [
            {
              name: 'Value',
              type: FieldType.number,
              values: [1],
              labels: { host: 'desconhecido', item_key: 'icmpping' },
              config: {},
            },
          ],
          length: 1,
        },
      ],
      hosts,
      'icmpping'
    );
    expect(items).toEqual([]);
  });

  it('lê frames wide com um campo de valor por host', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          fields: [
            { name: 'Time', type: FieldType.time, values: [3_000], config: {} },
            {
              name: 'host-a',
              type: FieldType.number,
              values: [1],
              labels: { host: 'host-a', item_key: 'icmpping' },
              config: {},
            },
            {
              name: 'host-b',
              type: FieldType.number,
              values: [0],
              labels: { host: 'host-b', item_key: 'icmpping' },
              config: {},
            },
          ],
          length: 1,
        },
      ],
      hosts,
      'icmpping'
    );
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.hostid).sort()).toEqual(['10', '11']);
  });

  it('lê valores de Vector (Grafana 10) e host no nome da série', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          name: 'host-a: ICMP ping',
          fields: [
            {
              name: 'Time',
              type: FieldType.time,
              values: { length: 1, get: (i: number) => [2_000_000][i], toArray: () => [2_000_000] },
              config: {},
            } as never,
            {
              name: 'Value',
              type: FieldType.number,
              values: { length: 1, get: (i: number) => [1][i], toArray: () => [1] },
              config: {},
            } as never,
          ],
          length: 1,
        },
      ],
      hosts,
      'icmpping'
    );
    expect(items).toHaveLength(1);
    expect(items[0].hostid).toBe('10');
    expect(items[0].lastvalue).toBe('1');
  });

  it('aceita a série quando o campo do painel é o nome do item, não a key_', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          fields: [
            { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [1],
              labels: { host: 'host-a', item_key: 'icmppingsec', item: 'Status item' },
              config: {},
            },
          ],
          length: 1,
        },
      ],
      hosts,
      'Status item'
    );
    expect(items).toHaveLength(1);
    expect(items[0].hostid).toBe('10');
    expect(items[0].key_).toBe('icmppingsec');
    expect(items[0].name).toBe('Status item');
  });

  it('usa o hostid do itemLookup quando o frame só traz itemid', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          fields: [
            { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [1],
              labels: { itemid: '100', item_key: 'icmpping' },
              config: {},
            },
          ],
          length: 1,
        },
      ],
      hosts,
      'icmpping',
      [{ itemid: '100', hostid: '10', key_: 'icmpping' }]
    );
    expect(items).toHaveLength(1);
    expect(items[0].hostid).toBe('10');
    expect(items[0].lastvalue).toBe('1');
  });

  it('ignora série cuja item_key é derivada da chave de status', () => {
    const items = parseStatusItemsFromFrames(
      [
        {
          fields: [
            { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [100],
              labels: { host: 'host-a', item_key: 'icmppingloss' },
              config: {},
            },
          ],
          length: 1,
        },
      ],
      hosts,
      'icmpping'
    );
    expect(items).toEqual([]);
  });
});

describe('fetchZabbixStatusViaQuery', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  const hosts = [host({ hostid: '10', name: 'host-a' })];

  it('chama ds.query uma vez com todos os grupos e devolve itens do frame', async () => {
    const query = vi.fn().mockReturnValue(
      of({
        data: [
          {
            fields: [
              { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
              {
                name: 'Value',
                type: FieldType.number,
                values: [1],
                labels: { host: 'host-a', item_key: 'icmpping' },
                config: {},
              },
            ],
            length: 1,
          },
        ],
      })
    );
    getMock.mockResolvedValue({ query });

    const { items } = await fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone', 'Borda'],
      statusItemKey: 'icmpping',
      hosts,
      refreshSec: 30,
    });

    expect(getMock).toHaveBeenCalledWith('ds');
    expect(query).toHaveBeenCalledTimes(1);
    const request = query.mock.calls[0][0] as { targets: unknown[]; skipQueryCache?: boolean };
    expect(request.targets).toHaveLength(1);
    expect(request.skipQueryCache).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].lastvalue).toBe('1');
  });

  it('busca tráfego dos cabos em paralelo, com janela curta e requestId próprio', async () => {
    const query = vi.fn().mockImplementation((request: { requestId?: string }) => {
      if (request.requestId === 'topology-traffic-ds') {
        return of({
          data: [
            {
              refId: 'T0',
              fields: [
                { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
                {
                  name: 'Value',
                  type: FieldType.number,
                  values: [42],
                  labels: { host: 'host-a', item: 'RX', item_key: 'vendor.metric.rx[10]' },
                  config: {},
                },
              ],
              length: 1,
            },
          ],
        });
      }
      return of({
        data: [
          {
            fields: [
              { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
              {
                name: 'Value',
                type: FieldType.number,
                values: [1],
                labels: { host: 'host-a', item_key: 'icmpping' },
                config: {},
              },
            ],
            length: 1,
          },
        ],
      });
    });
    getMock.mockResolvedValue({ query });

    const snapshot = await fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts,
      refreshSec: 30,
      trafficItemIds: ['10', '11'],
    });

    expect(query).toHaveBeenCalledTimes(2);
    const ids = query.mock.calls.map(
      (call) => (call[0] as { requestId?: string }).requestId
    );
    expect(ids).toContain('topology-status-ds');
    expect(ids).toContain('topology-traffic-ds');
    const trafficReq = query.mock.calls.find(
      (call) => (call[0] as { requestId?: string }).requestId === 'topology-traffic-ds'
    )?.[0] as {
      maxDataPoints?: number;
      range: { from: { valueOf: () => number }; to: { valueOf: () => number } };
    };
    expect(trafficReq.maxDataPoints).toBe(TRAFFIC_QUERY_MAX_POINTS);
    expect(trafficReq.range.to.valueOf() - trafficReq.range.from.valueOf()).toBe(
      ZABBIX_STATUS_QUERY_RANGE_SEC * 1000
    );
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.lastValues['vendor.metric.rx[10]']?.lastvalue).toBe('42');
  });

  it('ignora a emissão Loading vazia e usa o Done', async () => {
    const query = vi.fn().mockReturnValue(
      of(
        { state: LoadingState.Loading, data: [] },
        {
          state: LoadingState.Done,
          data: [
            {
              fields: [
                { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
                {
                  name: 'Value',
                  type: FieldType.number,
                  values: [1],
                  labels: { host: 'host-a', item_key: 'icmpping' },
                  config: {},
                },
              ],
              length: 1,
            },
          ],
        }
      )
    );
    getMock.mockResolvedValue({ query });

    const { items } = await fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts,
      refreshSec: 30,
    });

    expect(items).toHaveLength(1);
    expect(items[0].lastvalue).toBe('1');
  });

  it('com itemids chama ds.query em modo Item ID', async () => {
    const query = vi.fn().mockReturnValue(
      of({
        data: [
          {
            name: 'host-a: Status item',
            fields: [
              { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
              {
                name: 'Value',
                type: FieldType.number,
                values: [0.002],
                labels: { host: 'host-a', item_key: 'icmppingsec' },
                config: {},
              },
            ],
            length: 1,
          },
        ],
      })
    );
    getMock.mockResolvedValue({ query });

    const { items } = await fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmppingsec',
      hosts,
      itemIds: ['100'],
      refreshSec: 30,
    });

    const request = query.mock.calls[0][0] as { targets: Array<{ queryType?: string; itemids?: string }> };
    expect(request.targets).toHaveLength(1);
    expect(request.targets[0].queryType).toBe('3');
    expect(request.targets[0].itemids).toBe('100');
    expect(items).toHaveLength(1);
    expect(items[0].key_).toBe('icmppingsec');
    expect(items[0].lastvalue).toBe('0.002');
  });

  it('com itemIds vazio não chama o datasource', async () => {
    const { items } = await fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmppingsec',
      hosts,
      itemIds: [],
      refreshSec: 30,
    });
    expect(getMock).not.toHaveBeenCalled();
    expect(items).toEqual([]);
  });

  it('repete a chamada instável antes de desistir', async () => {
    let attempts = 0;
    getMock.mockImplementation(async () => {
      attempts += 1;
      if (attempts < STATUS_QUERY_MAX_ATTEMPTS) {
        throw new Error('network error');
      }
      return {
        query: () =>
          of({
            data: [
              {
                fields: [
                  {
                    name: 'Value',
                    type: FieldType.number,
                    values: [1],
                    labels: { host: 'host-a', item_key: 'icmpping' },
                    config: {},
                  },
                ],
                length: 1,
              },
            ],
          }),
      };
    });

    const { items } = await fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts,
      refreshSec: 30,
    });

    expect(attempts).toBe(STATUS_QUERY_MAX_ATTEMPTS);
    expect(items).toHaveLength(1);
  });

  it('propaga a falha em vez de devolver status vazio quando esgota as tentativas', async () => {
    getMock.mockRejectedValue(new Error('boom'));

    await expect(
      fetchZabbixStatusViaQuery({
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        hosts,
        refreshSec: 30,
      })
    ).rejects.toThrow('Falha ao consultar itens de status no Zabbix.');
  });

  it('não repete quando o Grafana aborta o requestId anterior', async () => {
    getMock.mockRejectedValue(new Error('Request was aborted'));

    await expect(
      fetchZabbixStatusViaQuery({
        datasourceUid: 'ds',
        groupNames: ['Backbone'],
        statusItemKey: 'icmpping',
        hosts,
        refreshSec: 30,
      })
    ).rejects.toThrow(/abort/i);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('cancela a subscription quando o AbortSignal dispara', async () => {
    const subject = new Subject();
    getMock.mockResolvedValue({ query: () => subject.asObservable() });
    const controller = new AbortController();

    const pending = fetchZabbixStatusViaQuery({
      datasourceUid: 'ds',
      groupNames: ['Backbone'],
      statusItemKey: 'icmpping',
      hosts,
      abortSignal: controller.signal,
      refreshSec: 30,
    });
    controller.abort();

    await expect(pending).rejects.toThrow(/abort/i);
  });
});

describe('parseItemLastValuesFromFrames', () => {
  it('indexa o último ponto por itemid do refId e pela item_key', () => {
    const values = parseItemLastValuesFromFrames([
      {
        refId: 'I10',
        fields: [
          { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
          {
            name: 'Value',
            type: FieldType.number,
            values: [100],
            labels: { item_key: 'vendor.metric.rx[10]' },
            config: {},
          },
        ],
        length: 1,
      },
    ]);
    expect(values['10']?.lastvalue).toBe('100');
    expect(values['vendor.metric.rx[10]']?.lastvalue).toBe('100');
  });

  it('indexa frames de cabo (refId T) pelo itemid do campo', () => {
    const values = parseItemLastValuesFromFrames([
      {
        refId: 'T0',
        fields: [
          { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
          {
            name: 'Value',
            type: FieldType.number,
            values: [42],
            labels: { itemid: '10', item_key: 'vendor.metric.rx[10]' },
            config: {},
          },
        ],
        length: 1,
      },
    ]);
    expect(values['10']?.lastvalue).toBe('42');
    expect(values['0']).toBeUndefined();
  });

  it('indexa o frame real do grafana-zabbix (item_key, sem label itemid)', () => {
    const values = parseItemLastValuesFromFrames([
      {
        refId: 'T0',
        fields: [
          { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
          {
            name: 'Value',
            type: FieldType.number,
            values: [42],
            labels: { host: 'host-a', item: 'RX', item_key: 'vendor.metric.rx[10]' },
            config: {},
          },
        ],
        length: 1,
      },
    ]);
    expect(values['vendor.metric.rx[10]']?.lastvalue).toBe('42');
    expect(values['0']).toBeUndefined();
  });
});

describe('buildZabbixProblemsTargets', () => {
  it('escopa o filtro ao grupo visível e não usa /.*/ de grupo', () => {
    const targets = buildZabbixProblemsTargets('ds', ['Backbone', 'Borda']);
    expect(targets).toHaveLength(1);
    expect(targets[0].group?.filter).toBe(zabbixGroupsFilter(['Backbone', 'Borda']));
    expect(targets[0].group?.filter).not.toBe('/.*/');
    expect(targets[0].queryType).toBe('5');
  });

  it('sem grupo não monta target', () => {
    expect(buildZabbixProblemsTargets('ds', [])).toEqual([]);
  });
});

describe('parseProblemsFromFrames', () => {
  it('agrega Warning+ por hostid e ignora severidade menor', () => {
    const summary = parseProblemsFromFrames(
      [
        {
          name: 'problems',
          fields: [
            {
              name: 'Problems',
              type: FieldType.other,
              values: [
                { severity: 4, name: 'Interface down', hosts: [{ hostid: '1001' }] },
                { severity: 2, name: 'ICMP timeout', hosts: [{ hostid: '1001' }] },
                { severity: 1, name: 'Info only', hosts: [{ hostid: '1001' }] },
              ],
              config: {},
            },
          ],
          length: 3,
        },
      ],
      ['1001']
    );
    expect(summary['1001']?.count).toBe(2);
    expect(summary['1001']?.maxSeverity).toBe(4);
    expect(summary['1001']?.names).toEqual(['Interface down', 'ICMP timeout']);
  });
});

describe('zabbixItemNameFilter', () => {
  it('usa o nome exato quando há um só, sem metacaractere', () => {
    expect(zabbixItemNameFilter(['Status item'])).toBe('Status item');
    expect(zabbixItemNameFilter(['ICMP ping', 'Status item'])).toBe('/^(?:ICMP ping|Status item)$/');
  });
});

describe('zabbixMetricsItemFilter', () => {
  it('trata chave no formato Zabbix, nome e regex pronta', () => {
    expect(zabbixMetricsItemFilter('icmpping')).toBe(zabbixStatusItemFilter('icmpping'));
    expect(zabbixMetricsItemFilter('Status item')).toBe('Status item');
    expect(zabbixMetricsItemFilter('/ICMP ping/i')).toBe('/ICMP ping/i');
  });
});

describe('zabbixInterfaceHostFilter', () => {
  it('ignora IP e ancora o nome sem distinguir maiúsculas', () => {
    expect(zabbixInterfaceHostFilter(['10.0.0.1', 'host-a'])).toBe('/^host-a$/i');
    expect(zabbixInterfaceHostFilter(['host-a', 'host-b'])).toBe('/^(?:host-a|host-b)$/i');
    expect(zabbixInterfaceHostFilter(['10.0.0.1'])).toBe('');
  });
});

describe('buildZabbixInterfaceTargets', () => {
  it('monta um target por host com item /.*/ e sem usar IP no filtro de host', () => {
    const targets = buildZabbixInterfaceTargets('ds', [
      { hostKey: '10.0.0.1', name: 'host-a', aliases: ['host-a', '10.0.0.1'], group: 'Backbone' },
      { hostKey: '10.0.0.2', name: 'host-b' },
    ]);
    expect(targets).toHaveLength(2);
    expect(targets[0].group?.filter).toBe('Backbone');
    expect(targets[0].host?.filter).toBe('/^host-a$/i');
    expect(targets[0].item?.filter).toBe(ZABBIX_INTERFACE_ITEM_FILTER);
    expect(targets[1].group?.filter).toBe('/.*/');
    expect(targets[1].host?.filter).toBe('/^host-b$/i');
  });

  it('não monta target quando o host só tem IP', () => {
    expect(buildZabbixInterfaceTargets('ds', [{ hostKey: '10.0.0.1', name: '10.0.0.1' }])).toEqual([]);
  });
});

describe('parseInterfaceItemsFromFrames', () => {
  it('agrupa o último ponto pela key e casa o host pelo IP da metadata', () => {
    const entries = parseInterfaceItemsFromFrames(
      [
        {
          name: 'host-a: RX',
          fields: [
            { name: 'Time', type: FieldType.time, values: [2_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [100],
              labels: { host: 'host-a', item_key: 'vendor.metric.rx[10]', item: 'RX if10' },
              config: {},
            },
          ],
          length: 1,
        },
      ],
      ['10.0.0.1'],
      ['vendor.metric.rx'],
      { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '10001' } }
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].hostid).toBe('10001');
    expect(entries[0].items).toHaveLength(1);
    expect(entries[0].items[0].key_).toBe('vendor.metric.rx[10]');
    expect(entries[0].items[0].lastvalue).toBe('100');
    expect(entries[0].items[0].name).toBe('RX if10');
  });

  it('mantém o item sem último valor numérico quando a key casa com a palavra-chave', () => {
    const entries = parseInterfaceItemsFromFrames(
      [
        {
          fields: [
            {
              name: 'Value',
              type: FieldType.number,
              values: [],
              labels: { host: 'host-a', item_key: 'vendor.metric.rx[10]', itemid: '21' },
              config: {},
            },
          ],
          length: 0,
        },
      ],
      ['host-a'],
      ['vendor.metric.rx'],
      { 'host-a': { name: 'host-a', hostid: '10001' } }
    );
    expect(entries[0].items).toHaveLength(1);
    expect(entries[0].items[0].itemid).toBe('21');
    expect(entries[0].items[0].lastvalue).toBeUndefined();
  });
});

describe('fetchZabbixHostInterfaceItemsViaQuery', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('consulta um target por hostid mesmo com várias chaves de lookup', async () => {
    const query = vi.fn().mockReturnValue(of({ data: [] }));
    getMock.mockResolvedValue({ query });

    await fetchZabbixHostInterfaceItemsViaQuery(
      'ds',
      ['10.0.0.1', 'host-a'],
      ['vendor.metric.rx'],
      {
        '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '10001', hostGroups: ['Backbone'] },
        'host-a': { name: 'host-a', ip: '10.0.0.1', hostid: '10001', hostGroups: ['Backbone'] },
      }
    );

    const request = query.mock.calls[0][0] as {
      maxDataPoints: number;
      requestId: string;
      targets: Array<{ group?: { filter: string }; host?: { filter: string }; item?: { filter: string } }>;
    };
    expect(request.targets).toHaveLength(1);
    expect(request.targets[0].group?.filter).toBe('Backbone');
    expect(request.targets[0].host?.filter).toBe('/^host-a$/i');
    expect(request.targets[0].item?.filter).toBe(ZABBIX_INTERFACE_ITEM_FILTER);
    expect(request.maxDataPoints).toBe(1);
    expect(request.requestId).toMatch(/^topology-interfaces-ds-\d+$/);
  });

  it('usa requestId diferente para cada extremo do cabo', async () => {
    const query = vi.fn().mockReturnValue(of({ data: [] }));
    getMock.mockResolvedValue({ query });

    await fetchZabbixHostInterfaceItemsViaQuery('ds', ['host-a'], ['vendor.metric.rx'], {
      'host-a': { name: 'host-a', hostid: '10001', hostGroups: ['Backbone'] },
    });
    await fetchZabbixHostInterfaceItemsViaQuery('ds', ['host-b'], ['vendor.metric.rx'], {
      'host-b': { name: 'host-b', hostid: '10002', hostGroups: ['Backbone'] },
    });

    const first = query.mock.calls[0][0] as { requestId: string };
    const second = query.mock.calls[1][0] as { requestId: string };
    expect(first.requestId).not.toBe(second.requestId);
  });
});

describe('parseHoverSeriesFromFrames', () => {
  it('indexa a série do poll pelo hostid e pelo nome', () => {
    const byHost = parseHoverSeriesFromFrames(
      [
        {
          fields: [
            { name: 'Time', type: FieldType.time, values: [1_000_000, 2_000_000], config: {} },
            {
              name: 'Value',
              type: FieldType.number,
              values: [0.012, 0.014],
              labels: { host: 'host-a', item_key: 'icmppingsec', item: 'Status item' },
              config: {},
            },
          ],
          length: 2,
        },
      ],
      [host({ hostid: '10', name: 'host-a' })],
      'Status item',
      {
        colorOnline: '#0f0',
        colorOffline: '#f00',
        colorAlert: '#fa0',
        statusValueMappings: [
          { value: 0, status: 'offline', label: 'Down' },
          { from: 0, status: 'online', label: 'Up' },
        ],
      }
    );

    expect(byHost['10']?.points).toHaveLength(2);
    expect(byHost['host-a']?.points).toHaveLength(2);
  });
});

describe('fetchZabbixHostGroupNamesViaQuery', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('pede grupos com o queryType group do grafana-zabbix, não o modo Metrics', async () => {
    const metricFindQuery = vi.fn().mockResolvedValue([{ text: 'Backbone' }, { text: 'Borda' }]);
    getMock.mockResolvedValue({ metricFindQuery });

    const names = await fetchZabbixHostGroupNamesViaQuery('ds');

    expect(metricFindQuery).toHaveBeenCalledWith({ queryType: ZABBIX_MFQ_GROUPS, group: '/.*/' });
    expect(names).toEqual(['Backbone', 'Borda']);
  });
});

describe('fetchZabbixItemNamesViaQuery', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('devolve lista vazia sem grupo, sem chamar o datasource', async () => {
    const names = await fetchZabbixItemNamesViaQuery('ds', []);
    expect(names).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('lista nomes únicos do campo Item no primeiro grupo com resultado', async () => {
    const metricFindQuery = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ text: 'Status item' }, { text: 'Status item' }, { value: 'ICMP ping' }]);
    getMock.mockResolvedValue({ metricFindQuery });

    const names = await fetchZabbixItemNamesViaQuery('ds', ['Backbone', 'Borda']);

    expect(metricFindQuery).toHaveBeenNthCalledWith(1, {
      queryType: ZABBIX_MFQ_ITEMS,
      group: 'Backbone',
      host: '/.*/',
      application: '',
      itemTag: '',
      item: '/.*/',
    });
    expect(metricFindQuery).toHaveBeenNthCalledWith(2, {
      queryType: ZABBIX_MFQ_ITEMS,
      group: 'Borda',
      host: '/.*/',
      application: '',
      itemTag: '',
      item: '/.*/',
    });
    expect(names).toEqual(['ICMP ping', 'Status item']);
  });
});
