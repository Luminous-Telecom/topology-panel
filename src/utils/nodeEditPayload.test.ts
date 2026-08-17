import { describe, expect, it } from 'vitest';
import { initialNodeEditValues, NodeEditFormValues } from '../hooks/useNodeEditForm';
import { TopologyNode } from '../types';
import { buildNodeEditPayload } from './nodeEditPayload';

function node(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return { id: 'n1', type: 'host', x: 10, y: 20, ...overrides };
}

function values(n: TopologyNode, overrides: Partial<NodeEditFormValues> = {}): NodeEditFormValues {
  return { ...initialNodeEditValues(n), ...overrides };
}

describe('buildNodeEditPayload — host do Zabbix', () => {
  const zabbix = node({ zabbixHost: 'RB-01', label: 'RB-01', subtitle: '10.0.0.1', icon: 'router' });

  it('sem IPv4 válido não deixa salvar', () => {
    expect(buildNodeEditPayload(zabbix, values(zabbix), { ip: 'não-ip' }, undefined)).toBeNull();
  });

  it('só credenciais mudam quando o host segue o mesmo', () => {
    const payload = buildNodeEditPayload(
      zabbix,
      values(zabbix, { toolUsername: '  admin  ', toolPassword: 'x' }),
      { ip: '10.0.0.1', visibleName: 'RB-01' },
      '10.0.0.1'
    );
    expect(payload).toEqual({ patch: { toolUsername: 'admin', toolPassword: 'x' } });
  });

  it('trocar de host gera rebind com nome, IP e ícone', () => {
    const payload = buildNodeEditPayload(
      zabbix,
      values(zabbix, { icon: 'firewall' }),
      { ip: '10.0.0.9', visibleName: 'FW-02' },
      '10.0.0.1'
    );
    expect(payload?.rebind).toEqual({ visibleName: 'FW-02', ip: '10.0.0.9', icon: 'firewall' });
    expect(payload?.patch.icon).toBe('firewall');
  });

  it('ícone igual ao salvo não entra no patch', () => {
    const payload = buildNodeEditPayload(
      zabbix,
      values(zabbix),
      { ip: '10.0.0.1', visibleName: 'RB-01' },
      '10.0.0.1'
    );
    expect(payload?.patch.icon).toBeUndefined();
  });
});

describe('buildNodeEditPayload — demais tipos', () => {
  it('rede aplica mínimos de tamanho e limpa cor vazia', () => {
    const n = node({ type: 'network', label: 'Sala' });
    const payload = buildNodeEditPayload(
      n,
      values(n, { width: '10', height: '5', fillColor: '   ', borderColor: '#fff' })
    );
    expect(payload?.patch).toMatchObject({
      width: 60,
      height: 40,
      fillColor: undefined,
      borderColor: '#fff',
    });
  });

  it('rede sem nome digitado mantém o nome salvo', () => {
    const n = node({ type: 'network', label: 'Sala' });
    expect(buildNodeEditPayload(n, values(n, { label: '  ' }))?.patch.label).toBe('Sala');
  });

  it('submapa: medida vazia vira automático e refId sobe para maiúsculas', () => {
    const n = node({ type: 'submap' });
    const payload = buildNodeEditPayload(n, values(n, { width: '', queryRefId: ' b ' }));
    expect(payload?.patch.width).toBeUndefined();
    expect(payload?.patch.queryRefId).toBe('B');
  });

  it('seletor descarta dashboard sem uid e não guarda subtítulo', () => {
    const n = node({ type: 'dashboard_picker' });
    const payload = buildNodeEditPayload(
      n,
      values(n, {
        subtitle: 'ignorado',
        dashboardChoices: [
          { uid: 'abc', title: 'Ok' },
          { uid: '  ', title: 'Vazio' },
        ],
      })
    );
    expect(payload?.patch.dashboardChoices).toEqual([{ uid: 'abc', title: 'Ok' }]);
    expect(payload?.patch.subtitle).toBeUndefined();
  });

  it('estático respeita o mínimo da fonte', () => {
    const n = node({ type: 'static' });
    expect(buildNodeEditPayload(n, values(n, { fontSize: '2' }))?.patch.fontSize).toBe(8);
  });

  it('host manual guarda credenciais sem espaços', () => {
    const n = node({ label: 'Switch' });
    const payload = buildNodeEditPayload(n, values(n, { toolUsername: ' admin ' }));
    expect(payload?.patch.toolUsername).toBe('admin');
    expect(payload?.patch.icon).toBe('network');
  });
});
