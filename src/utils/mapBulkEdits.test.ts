import { describe, expect, it } from 'vitest';
import { updateHostsIconBulk } from './mapBulkEdits';
import { emptyMap, hostNode } from './testMapFixtures';

describe('updateHostsIconBulk', () => {
  it('sem ícone informado, retorna o mesmo mapa', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1' })] });
    expect(updateHostsIconBulk(map, map.nodes, undefined)).toBe(map);
  });

  it('aplica o ícone a todos os hosts selecionados vinculados à Query', () => {
    const map = emptyMap({
      nodes: [
        hostNode({ id: 'a', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'b', zabbixHost: '10.0.0.2' }),
      ],
    });
    const next = updateHostsIconBulk(map, map.nodes, 'switch_managed');
    expect(next.nodes.every((n) => n.icon === 'switch_managed')).toBe(true);
    expect(next.hostIcons?.['10.0.0.1']).toBe('switch_managed');
    expect(next.hostIcons?.['10.0.0.2']).toBe('switch_managed');
  });
});
