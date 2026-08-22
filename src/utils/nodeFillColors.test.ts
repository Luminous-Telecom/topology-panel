import { describe, expect, it } from 'vitest';
import { HostDisplayMap, HostMetadataMap, TopologyNode, TopologyPanelOptions, defaultOptions } from '../types';
import { RegionHostStats } from './networkStats';
import { hostNodeFill, resolveNetworkFill, resolveNodeFill } from './nodeFillColors';

const options: TopologyPanelOptions = defaultOptions();
/** No painel real quem resolve é o tema; aqui basta a identidade. */
const identity = (color?: unknown) => String(color ?? '');

function node(overrides?: Partial<TopologyNode>): TopologyNode {
  return { id: 'n1', type: 'host', x: 0, y: 0, ...overrides };
}

function stats(overrides?: Partial<RegionHostStats>): RegionHostStats {
  return { total: 2, online: 2, offline: 0, alert: 0, unknown: 0, ...overrides };
}

describe('hostNodeFill', () => {
  it('usa colorUnknown quando o nó não tem host Zabbix', () => {
    expect(hostNodeFill(node(), options)).toBe(options.colorUnknown);
  });

  it('usa colorUnknown quando o host não tem status na Query', () => {
    expect(hostNodeFill(node({ zabbixHost: 'rb-01' }), options, {}, {})).toBe(options.colorUnknown);
  });

  it('offline no mapa usa colorOffline configurado no painel', () => {
    const display: HostDisplayMap = { 'rb-01': { status: 'offline', color: '#ff0000', value: 0 } };
    expect(hostNodeFill(node({ zabbixHost: 'rb-01' }), options, {}, display, identity)).toBe(
      options.colorOffline
    );
  });

  it('câmera offline não usa cor de tipo — prioriza colorOffline', () => {
    const display: HostDisplayMap = { 'cam-01': { status: 'offline', color: '#ff0000', value: 0 } };
    expect(
      hostNodeFill(node({ zabbixHost: 'cam-01', icon: 'camera' }), options, {}, display, identity)
    ).toBe(options.colorOffline);
  });

  it('câmera online usa a cor pintada do tipo', () => {
    const display: HostDisplayMap = {
      'cam-01': { status: 'online', color: options.colorOnline, value: 0.0006 },
    };
    expect(
      hostNodeFill(node({ zabbixHost: 'cam-01', icon: 'camera' }), options, {}, display, identity)
    ).toBe(options.hostTypeColors?.camera);
  });

  it('problemas Zabbix pintam host online com colorAlert', () => {
    const display: HostDisplayMap = {
      'rb-01': { status: 'online', color: options.colorOnline, value: 1 },
    };
    const metadata: HostMetadataMap = { 'rb-01': { name: 'rb-01', hostid: 'hid1' } };
    const problems = { hid1: { count: 2, maxSeverity: 4 } };
    expect(
      hostNodeFill(node({ zabbixHost: 'rb-01' }), options, metadata, display, identity, problems)
    ).toBe(options.colorAlert);
  });

  it('offline vence problema Zabbix na cor do host', () => {
    const display: HostDisplayMap = {
      'rb-01': { status: 'offline', color: '#ff0000', value: 0 },
    };
    const metadata: HostMetadataMap = { 'rb-01': { name: 'rb-01', hostid: 'hid1' } };
    const problems = { hid1: { count: 2, maxSeverity: 4 } };
    expect(
      hostNodeFill(node({ zabbixHost: 'rb-01' }), options, metadata, display, identity, problems)
    ).toBe(options.colorOffline);
  });

  it('prefere a cor manual do nó estático', () => {
    expect(hostNodeFill(node({ type: 'static', fillColor: '#123456' }), options)).toBe('#123456');
  });
});

describe('resolveNetworkFill', () => {
  it('cai no padrão do painel sem status agregado', () => {
    expect(resolveNetworkFill(node({ type: 'network' }), undefined, options, false, identity)).toBe(
      options.colorNetworkFill
    );
  });

  it('usa a cor de offline quando há host caído na região', () => {
    const fill = resolveNetworkFill(
      node({ type: 'network' }),
      stats({ online: 0, offline: 2 }),
      options,
      true,
      identity
    );
    expect(fill).not.toBe(options.colorNetworkFill);
  });

  /**
   * `regionFillColor` sempre devolve uma cor para rede, então a cor manual da caixa nunca chega a
   * ser usada. Comportamento de hoje, fixado aqui para a divisão do canvas não mudá-lo sem querer.
   */
  it('ignora a cor manual da caixa de rede — o status agregado sempre decide', () => {
    expect(
      resolveNetworkFill(node({ type: 'network', fillColor: '#0a0a0a' }), undefined, options, false, identity)
    ).toBe(options.colorNetworkFill);
  });
});

describe('resolveNodeFill', () => {
  it('usa a cor manual antes da cor derivada do status', () => {
    expect(
      resolveNodeFill(node({ zabbixHost: 'rb-01', fillColor: '#abcdef' }), undefined, options, true, {}, {}, identity)
    ).toBe('#abcdef');
  });

  it('host sem status fica em colorUnknown', () => {
    expect(resolveNodeFill(node({ zabbixHost: 'rb-01' }), undefined, options, true, {}, {}, identity)).toBe(
      options.colorUnknown
    );
  });

  it('submapa sem dados fica em colorUnknown', () => {
    expect(
      resolveNodeFill(node({ type: 'submap', label: 'Filial' }), undefined, options, false, {}, {}, identity)
    ).toBe(options.colorUnknown);
  });
});
