import { describe, expect, it } from 'vitest';
import {
  aliasLastValuesByItemKey,
  buildLinkRuntimeMetricsMap,
  coalesceLinkTraffic,
  collectLinkMetricKeys,
  collectLinkSignalHostIds,
  collectMapsLinks,
  collectPolledSignalItemIds,
  linkSignalSearchTerms,
  resolveLinkMapTrafficMetrics,
  sameLinkLinePaint,
} from './linkMetricsRuntime';
import { linkKey } from './mapLinkEdits';
import { emptyMap, hostNode } from './testMapFixtures';

describe('buildLinkRuntimeMetricsMap', () => {
  it('calcula RX/TX e utilização por endpoint', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'a',
          to: 'b',
          bandwidthMbps: 1000,
          fromInterface: {
            name: 'eth0',
            metrics: {
              rx: { itemId: '10' },
              tx: { itemId: '11' },
              operStatus: { itemId: '12' },
            },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      '10': { itemid: '10', lastvalue: '500000000' },
      '11': { itemid: '11', lastvalue: '100000000' },
      '12': { itemid: '12', lastvalue: '1' },
    });
    const linkMetrics = metrics[linkKey(map.links[0]!)];
    expect(linkMetrics?.from.rxBps).toBe(500000000);
    expect(linkMetrics?.from.txBps).toBe(100000000);
    expect(linkMetrics?.from.rxUtilizationPct).toBe(50);
    expect(linkMetrics?.from.txUtilizationPct).toBe(10);
    expect(linkMetrics?.status).toBe('up');
  });

  it('marca o cabo down quando uma interface está oper down', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'a',
          to: 'b',
          fromInterface: {
            name: 'eth0',
            metrics: { operStatus: { itemId: '12' } },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      '12': { itemid: '12', lastvalue: '2' },
    });
    expect(metrics[linkKey(map.links[0]!)]?.status).toBe('down');
    expect(metrics[linkKey(map.links[0]!)]?.from.operStatus).toBe('down');
  });

  it('lê o cabo vinculado só por key, sem itemid numérico', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'a',
          to: 'b',
          bandwidthMbps: 1000,
          fromInterface: {
            name: 'eth0',
            metrics: {
              rx: { key: 'vendor.metric.rx[10]' },
              tx: { key: 'vendor.metric.tx[10]' },
            },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      'vendor.metric.rx[10]': { itemid: '', lastvalue: '250000000' },
      'vendor.metric.tx[10]': { itemid: '', lastvalue: '50000000' },
    });
    expect(metrics[linkKey(map.links[0]!)]?.from.rxBps).toBe(250000000);
    expect(metrics[linkKey(map.links[0]!)]?.from.txBps).toBe(50000000);
    // A orientação do mapa também precisa reconhecer o vínculo por key.
    expect(resolveLinkMapTrafficMetrics(map.links[0], metrics[linkKey(map.links[0]!)]).rxBps).toBe(250000000);
  });

  it('lê sinal óptico negativo em dBm', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'a',
          to: 'b',
          fromInterface: {
            name: 'eth0',
            metrics: {
              rxPower: { itemId: '30' },
              txPower: { itemId: '31' },
            },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      '30': { itemid: '30', lastvalue: '-8.5' },
      '31': { itemid: '31', lastvalue: '-2' },
    });
    expect(metrics[linkKey(map.links[0]!)]?.from.rxPowerDbm).toBe(-8.5);
    expect(metrics[linkKey(map.links[0]!)]?.from.txPowerDbm).toBe(-2);
  });

  it('vincula sinal descoberto no mesmo lastvalue do poll, sem gravar no JSON', () => {
    const map = {
      ...emptyMap({
        nodes: [
          hostNode({ id: 'a', zabbixHost: '10.0.0.1', label: 'host-a' }),
          hostNode({ id: 'b', x: 80, zabbixHost: '10.0.0.2', label: 'host-b' }),
        ],
      }),
      links: [
        {
          from: 'a',
          to: 'b',
          fromInterface: {
            name: 'port-a0/0/3',
            metrics: {
              rx: { itemId: '10' },
              tx: { itemId: '11' },
            },
          },
        },
      ],
    };
    const metadata = {
      '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' },
    };
    const metrics = buildLinkRuntimeMetricsMap(
      map,
      {
        '10': { itemid: '10', lastvalue: '500000000' },
        '11': { itemid: '11', lastvalue: '100000000' },
        '30': { itemid: '30', lastvalue: '-8.5' },
        '31': { itemid: '31', lastvalue: '-2.1' },
      },
      undefined,
      metadata,
      [
        {
          itemid: '10',
          key_: 'vendor.metric.rx[10]',
          name: 'port-a0/0/3',
          hostid: '101',
          lastvalue: '500000000',
        },
        {
          itemid: '30',
          key_: 'vendor.optical.rxpower[10]',
          name: 'port-a0/0/3',
          hostid: '101',
          lastvalue: '-8.5',
        },
        {
          itemid: '31',
          key_: 'vendor.optical.txpower[10]',
          name: 'port-a0/0/3',
          hostid: '101',
          lastvalue: '-2.1',
        },
      ]
    );
    expect(metrics[linkKey(map.links[0]!)]?.from.rxPowerDbm).toBe(-8.5);
    expect(metrics[linkKey(map.links[0]!)]?.from.txPowerDbm).toBe(-2.1);
    expect(map.links[0]?.fromInterface?.metrics).toEqual({
      rx: { itemId: '10' },
      tx: { itemId: '11' },
    });
  });

  it('não mistura operStatus de dois hosts com a mesma chave de item', () => {
    const map = {
      ...emptyMap({
        nodes: [
          hostNode({ id: 'a', zabbixHost: '10.0.0.1', label: 'host-a' }),
          hostNode({ id: 'b', x: 80, zabbixHost: '10.0.0.2', label: 'host-b' }),
        ],
      }),
      links: [
        {
          from: 'a',
          to: 'b',
          fromInterface: {
            name: 'eth0',
            metrics: { operStatus: { key: 'vendor.metric.status[7]' } },
          },
          toInterface: {
            name: 'eth1',
            metrics: { operStatus: { key: 'vendor.metric.status[7]' } },
          },
        },
      ],
    };
    const metadata = {
      '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' },
      '10.0.0.2': { name: 'host-b', ip: '10.0.0.2', hostid: '102' },
    };
    const metrics = buildLinkRuntimeMetricsMap(
      map,
      {
        '101:vendor.metric.status[7]': { itemid: '1', lastvalue: '1' },
        '102:vendor.metric.status[7]': { itemid: '2', lastvalue: '2' },
      },
      undefined,
      metadata
    );
    expect(metrics[linkKey(map.links[0]!)]?.from.operStatus).toBe('up');
    expect(metrics[linkKey(map.links[0]!)]?.to.operStatus).toBe('down');
    expect(metrics[linkKey(map.links[0]!)]?.status).toBe('down');
  });

  it('lê operStatus pelo nome do host quando o frame não tem itemid', () => {
    const map = {
      ...emptyMap({
        nodes: [
          hostNode({ id: 'a', zabbixHost: '10.0.0.1', label: 'host-a' }),
          hostNode({ id: 'b', x: 80, zabbixHost: '10.0.0.2', label: 'host-b' }),
        ],
      }),
      links: [
        {
          from: 'a',
          to: 'b',
          fromInterface: {
            name: 'eth0',
            metrics: { operStatus: { key: 'vendor.metric.status[7]' } },
          },
          toInterface: {
            name: 'eth1',
            metrics: { operStatus: { key: 'vendor.metric.status[7]' } },
          },
        },
      ],
    };
    const metadata = {
      '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' },
      '10.0.0.2': { name: 'host-b', ip: '10.0.0.2', hostid: '102' },
    };
    const metrics = buildLinkRuntimeMetricsMap(
      map,
      {
        'host-a:vendor.metric.status[7]': { itemid: '', lastvalue: '1' },
        'host-b:vendor.metric.status[7]': { itemid: '', lastvalue: '2' },
      },
      undefined,
      metadata
    );
    expect(metrics[linkKey(map.links[0]!)]?.from.operStatus).toBe('up');
    expect(metrics[linkKey(map.links[0]!)]?.to.operStatus).toBe('down');
  });

  it('usa métricas do destino quando a origem não tem RX/TX (nuvem / link externo)', () => {
    const map = {
      ...emptyMap(),
      links: [
        {
          from: 'cloud',
          to: 'sw',
          toInterface: {
            name: 'eth0',
            metrics: {
              rx: { itemId: '20' },
              tx: { itemId: '21' },
            },
          },
        },
      ],
    };
    const metrics = buildLinkRuntimeMetricsMap(map, {
      '20': { itemid: '20', lastvalue: '800000000' },
      '21': { itemid: '21', lastvalue: '200000000' },
    });
    const runtime = metrics[linkKey(map.links[0]!)];
    const display = resolveLinkMapTrafficMetrics(map.links[0]!, runtime);
    expect(display.txBps).toBe(800000000);
    expect(display.rxBps).toBe(200000000);
  });
});

describe('collectPolledSignalItemIds', () => {
  const signalMap = {
    ...emptyMap({
      nodes: [
        hostNode({ id: 'a', zabbixHost: '10.0.0.1', label: 'host-a' }),
        hostNode({ id: 'b', x: 80, zabbixHost: '10.0.0.2', label: 'host-b' }),
      ],
    }),
    links: [
      {
        from: 'a',
        to: 'b',
        fromInterface: {
          name: 'port-a0/0/3',
          metrics: { rx: { itemId: '10' }, tx: { itemId: '11' } },
        },
      },
    ],
  };
  const metadata = { '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' } };
  const usedPort = [
    { itemid: '10', key_: 'vendor.metric.rx[10]', name: 'port-a0/0/3', hostid: '101' },
    { itemid: '30', key_: 'vendor.optical.rxpower[10]', name: 'port-a0/0/3', hostid: '101', lastvalue: '-8.5' },
    { itemid: '31', key_: 'vendor.optical.txpower[10]', name: 'port-a0/0/3', hostid: '101', lastvalue: '-2.1' },
  ];
  const otherPorts = Array.from({ length: 40 }, (_, index) => ({
    itemid: `${9000 + index}`,
    key_: `vendor.optical.rxpower[${900 + index}]`,
    name: `port-a0/1/${index}`,
    hostid: '101',
    lastvalue: '-20',
  }));

  it('devolve só o sinal da porta que algum cabo usa', () => {
    const ids = collectPolledSignalItemIds([signalMap], [...usedPort, ...otherPorts], metadata);
    expect(ids.sort()).toEqual(['30', '31']);
  });

  /*
   * O poll só varre o inventário completo de tempos em tempos; entre varreduras ele relê apenas
   * estes ids. Se a seleção não fosse estável, o sinal sumiria no ciclo seguinte.
   */
  it('mantém a mesma seleção sem as portas que nenhum cabo usa', () => {
    const ids = collectPolledSignalItemIds([signalMap], [...usedPort, ...otherPorts], metadata);
    const semRuido = usedPort.filter((item) => ids.includes(item.itemid) || item.itemid === '10');
    expect(collectPolledSignalItemIds([signalMap], semRuido, metadata).sort()).toEqual(ids.sort());
  });

  it('sem inventário não devolve id', () => {
    expect(collectPolledSignalItemIds([signalMap], [], metadata)).toEqual([]);
  });
});

describe('collectLinkMetricKeys', () => {
  it('coleta key só quando o cabo não tem itemid numérico', () => {
    const keys = collectLinkMetricKeys([
      {
        from: 'a',
        to: 'b',
        fromInterface: {
          name: 'eth0',
          metrics: {
            rx: { itemId: '10', key: 'vendor.metric.rx[10]' },
            tx: { key: 'vendor.metric.tx[10]' },
            rxPower: { key: 'vendor.optical.rxpower[10]' },
          },
        },
      },
    ]);
    expect(keys).toEqual(['vendor.metric.tx[10]', 'vendor.optical.rxpower[10]']);
  });
});

describe('collectMapsLinks', () => {
  it('junta cabos da raiz e dos mapas filhos', () => {
    const links = collectMapsLinks([
      { width: 1, height: 1, nodes: [], links: [{ from: 'a', to: 'b' }] },
      { width: 1, height: 1, nodes: [], links: [{ from: 'c', to: 'd' }] },
    ]);
    expect(links).toEqual([
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ]);
  });
});

describe('collectLinkSignalHostIds', () => {
  it('coleta hostid dos extremos com interface', () => {
    const map = {
      ...emptyMap({
        nodes: [
          hostNode({ id: 'a', zabbixHost: '10.0.0.1', label: 'host-a' }),
          hostNode({ id: 'b', x: 80, zabbixHost: '10.0.0.2', label: 'host-b' }),
        ],
      }),
      links: [
        {
          from: 'a',
          to: 'b',
          fromInterface: { name: 'port-a0/0/3', metrics: { rx: { itemId: '10' } } },
        },
      ],
    };
    const ids = collectLinkSignalHostIds(
      [map],
      {
        '10.0.0.1': { name: 'host-a', ip: '10.0.0.1', hostid: '101' },
        '10.0.0.2': { name: 'host-b', ip: '10.0.0.2', hostid: '102' },
      }
    );
    expect(ids).toEqual(['101', '102']);
  });
});

describe('linkSignalSearchTerms', () => {
  it('junta termos genéricos com as palavras-chave do painel', () => {
    const terms = linkSignalSearchTerms({
      zabbixRxPowerItemKeyword: 'custom-rx',
      zabbixTxPowerItemKeyword: 'custom-tx',
    });
    expect(terms).toEqual(expect.arrayContaining(['rxpower', 'optical', 'custom-rx', 'custom-tx']));
  });
});

describe('aliasLastValuesByItemKey', () => {
  it('copia o lastvalue do itemid resolvido para a key do cabo', () => {
    const aliased = aliasLastValuesByItemKey(
      { '77': { itemid: '77', lastvalue: '9' } },
      new Map([['vendor.metric.rx[10]', '77']])
    );
    expect(aliased['vendor.metric.rx[10]']?.lastvalue).toBe('9');
  });
});

describe('coalesceLinkTraffic', () => {
  it('mantém o lastvalue anterior quando o ciclo volta vazio', () => {
    const previous = {
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      interfaceItems: [{ itemid: '10', hostid: '1', key_: 'vendor.metric.rx[10]', lastvalue: '1' }],
    };
    const next = coalesceLinkTraffic({ lastValues: {}, interfaceItems: [] }, previous);
    expect(next.lastValues['10']?.lastvalue).toBe('1');
    expect(next.interfaceItems).toHaveLength(1);
  });

  it('usa o valor novo quando o ciclo devolve tráfego', () => {
    const previous = {
      lastValues: { '10': { itemid: '10', lastvalue: '1' } },
      interfaceItems: [],
    };
    const next = coalesceLinkTraffic(
      { lastValues: { '10': { itemid: '10', lastvalue: '9' } }, interfaceItems: [] },
      previous
    );
    expect(next.lastValues['10']?.lastvalue).toBe('9');
  });

  it('não apaga lastvalue de chave quando o ciclo seguinte só relê itemids', () => {
    const previous = {
      lastValues: {
        '10': { itemid: '10', lastvalue: '1' },
        '1:vendor.metric.rx[10]': { itemid: '77', lastvalue: '500000000' },
      },
      interfaceItems: [{ itemid: '77', hostid: '1', key_: 'vendor.metric.rx[10]', lastvalue: '500000000' }],
    };
    const next = coalesceLinkTraffic(
      {
        lastValues: { '10': { itemid: '10', lastvalue: '2' } },
        interfaceItems: [],
      },
      previous
    );
    expect(next.lastValues['10']?.lastvalue).toBe('2');
    expect(next.lastValues['1:vendor.metric.rx[10]']?.lastvalue).toBe('500000000');
    expect(next.interfaceItems).toHaveLength(1);
  });

  it('não zera lastvalue quando o ciclo devolve o item sem valor', () => {
    const previous = {
      lastValues: { '10': { itemid: '10', lastvalue: '500000000' } },
      interfaceItems: [{ itemid: '10', hostid: '1', key_: 'vendor.metric.rx[10]', lastvalue: '500000000' }],
    };
    const next = coalesceLinkTraffic(
      {
        lastValues: { '10': { itemid: '10', lastvalue: '' } },
        interfaceItems: [{ itemid: '10', hostid: '1', key_: 'vendor.metric.rx[10]', lastvalue: '' }],
      },
      previous
    );
    expect(next.lastValues['10']?.lastvalue).toBe('500000000');
    expect(next.interfaceItems[0]?.lastvalue).toBe('500000000');
  });
});

describe('sameLinkLinePaint', () => {
  function endpoint(pct: number, rxBps = 1_000_000) {
    return {
      rxBps,
      txBps: rxBps,
      rxUtilizationPct: pct,
      txUtilizationPct: pct,
      operStatus: 'up' as const,
      capacityMbps: 1000,
    };
  }

  function metrics(pct: number, rxBps = 1_000_000, status: 'up' | 'down' = 'up') {
    return { status, from: endpoint(pct, rxBps), to: endpoint(pct, rxBps) };
  }

  it('ignora bps e percentual na mesma faixa de utilização', () => {
    expect(sameLinkLinePaint(metrics(10, 1_000_000), metrics(40, 8_000_000))).toBe(true);
  });

  it('detecta troca de faixa de utilização', () => {
    expect(sameLinkLinePaint(metrics(10), metrics(95))).toBe(false);
  });

  it('detecta cabo down', () => {
    expect(sameLinkLinePaint(metrics(10, 1_000_000, 'up'), metrics(10, 1_000_000, 'down'))).toBe(false);
  });
});
