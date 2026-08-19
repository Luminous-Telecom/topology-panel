import { describe, expect, it } from 'vitest';
import { HostMetadataMap } from '../types';
import { mergeMapWithQueryHosts } from './mapSync';
import { emptyMap } from './testMapFixtures';

describe('mergeMapWithQueryHosts', () => {
  it('mapa vazio + hosts da Query cria nós em grade (posições incrementais)', () => {
    const next = mergeMapWithQueryHosts(emptyMap(), ['host-a', 'host-b']);
    expect(next.nodes).toHaveLength(2);
    expect(next.nodes[0]).toMatchObject({ zabbixHost: 'host-a', type: 'host', x: 100, y: 100 });
    expect(next.nodes[1]).toMatchObject({ zabbixHost: 'host-b', type: 'host', x: 260, y: 100 });
  });

  it('sem hosts na Query, mantém os hosts já configurados no mapa', () => {
    const map = emptyMap({
      nodes: [{ id: 'a', type: 'host', zabbixHost: 'host-a', x: 50, y: 50, label: 'Host A' }],
    });
    const next = mergeMapWithQueryHosts(map, []);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]).toMatchObject({ id: 'a', x: 50, y: 50, label: 'Host A' });
  });

  it('host já salvo preserva posição/id ao reaparecer na Query', () => {
    const map = emptyMap({
      nodes: [{ id: 'saved-a', type: 'host', zabbixHost: 'host-a', x: 321, y: 456, label: 'Host A' }],
    });
    const next = mergeMapWithQueryHosts(map, ['host-a']);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]).toMatchObject({ id: 'saved-a', x: 321, y: 456 });
  });

  it('host oculto (hiddenHosts) não reaparece mesmo estando na Query', () => {
    const map = emptyMap({ hiddenHosts: ['host-a'] });
    const next = mergeMapWithQueryHosts(map, ['host-a', 'host-b']);
    expect(next.nodes.map((n) => n.zabbixHost)).toEqual(['host-b']);
  });

  it('dispositivo manual sem Query não duplica nó fantasma na grade', () => {
    const map = emptyMap({
      nodes: [{ id: 'device-1', type: 'host', x: 200, y: 300, label: 'Dispositivo' }],
    });
    const next = mergeMapWithQueryHosts(map, []);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]).toMatchObject({ id: 'device-1', x: 200, y: 300 });
  });

  it('host salvo fora das queries de exibição permanece visível no mapa', () => {
    const map = emptyMap({
      nodes: [
        {
          id: 'saved-b',
          type: 'host',
          zabbixHost: '10.0.0.2',
          subtitle: '10.0.0.2',
          x: 50,
          y: 80,
          label: 'Host B',
        },
      ],
    });
    const metadata: HostMetadataMap = { 'host-a': { name: 'Host A', ip: '10.0.0.1' } };
    const next = mergeMapWithQueryHosts(map, ['host-a'], metadata);
    expect(next.nodes).toHaveLength(2);
    expect(next.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['saved-b']));
    expect(next.nodes.find((n) => n.id === 'saved-b')).toMatchObject({ x: 50, y: 80 });
  });

  it('host removido da Query mas mantido manualmente (sem zabbixHost) não some', () => {
    const map = emptyMap({
      nodes: [{ id: 'manual-1', type: 'host', x: 10, y: 10, label: 'Dispositivo manual' }],
    });
    const next = mergeMapWithQueryHosts(map, ['host-a']);
    expect(next.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['manual-1']));
    expect(next.nodes).toHaveLength(2);
  });

  it('preserva submapas, nós estáticos e de rede independente da Query', () => {
    const map = emptyMap({
      nodes: [
        { id: 'net-1', type: 'network', x: 0, y: 0 },
        { id: 'static-1', type: 'static', x: 0, y: 0 },
        { id: 'submap-1', type: 'submap', x: 0, y: 0 },
      ],
    });
    const next = mergeMapWithQueryHosts(map, ['host-a']);
    expect(next.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(['net-1', 'static-1', 'submap-1'])
    );
  });

  it('não emite dois nós com o mesmo id quando o mapa salvo tem cópia duplicada', () => {
    const map = emptyMap({
      nodes: [
        { id: 'host-dup', type: 'host', zabbixHost: 'query-host-z', x: -1089, y: -387, label: 'Host Z' },
        { id: 'host-dup', type: 'host', zabbixHost: 'query-host-z', x: -1009, y: -157, label: 'Host Z' },
      ],
    });
    const next = mergeMapWithQueryHosts(map, ['query-host-z']);
    const ids = next.nodes.filter((n) => n.type === 'host').map((n) => n.id);
    expect(ids).toEqual(['host-dup']);
  });

  it('usa o IP da metadata da Query como chave/hostToNodeId quando disponível', () => {
    const metadata: HostMetadataMap = { 'host-a': { name: 'Host A', ip: '10.0.0.5' } };
    const next = mergeMapWithQueryHosts(emptyMap(), ['host-a'], metadata);
    expect(next.nodes[0]).toMatchObject({ zabbixHost: '10.0.0.5', subtitle: '10.0.0.5', label: 'Host A' });
  });
});
