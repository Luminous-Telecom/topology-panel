import { describe, expect, it } from 'vitest';
import {
  aliasLastValuesByItemKey,
  buildLinkRuntimeMetricsMap,
  collectLinkMetricKeys,
  resolveLinkMapTrafficMetrics,
} from './linkMetricsRuntime';
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
    const linkMetrics = metrics['a-b'];
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
    expect(metrics['a-b']?.status).toBe('down');
    expect(metrics['a-b']?.from.operStatus).toBe('down');
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
    expect(metrics['a-b']?.from.rxBps).toBe(250000000);
    expect(metrics['a-b']?.from.txBps).toBe(50000000);
    // A orientação do mapa também precisa reconhecer o vínculo por key.
    expect(resolveLinkMapTrafficMetrics(map.links[0], metrics['a-b']).rxBps).toBe(250000000);
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
    expect(metrics['a-b']?.from.operStatus).toBe('up');
    expect(metrics['a-b']?.to.operStatus).toBe('down');
    expect(metrics['a-b']?.status).toBe('down');
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
    expect(metrics['a-b']?.from.operStatus).toBe('up');
    expect(metrics['a-b']?.to.operStatus).toBe('down');
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
    const runtime = metrics['cloud-sw'];
    const display = resolveLinkMapTrafficMetrics(map.links[0]!, runtime);
    expect(display.txBps).toBe(800000000);
    expect(display.rxBps).toBe(200000000);
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
          },
        },
      },
    ]);
    expect(keys).toEqual(['vendor.metric.tx[10]']);
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
