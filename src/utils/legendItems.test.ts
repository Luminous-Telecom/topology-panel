import { describe, expect, it } from 'vitest';
import { TopologyPanelOptions, defaultOptions } from '../types';
import { buildLegendItems } from './legendItems';

function options(overrides?: Partial<TopologyPanelOptions>): TopologyPanelOptions {
  return { ...defaultOptions(), ...overrides };
}

describe('buildLegendItems', () => {
  it('monta os itens mesmo com showLegend desligado — a caixa é quem decide mostrar', () => {
    const labels = buildLegendItems(options({ showLegend: false })).map((i) => i.label);
    expect(labels.slice(0, 4)).toEqual(['Sem dados', 'Online', 'Offline', 'Alerta']);
  });

  it('abre pelos quatro status, na ordem', () => {
    const labels = buildLegendItems(options()).map((i) => i.label);
    expect(labels.slice(0, 4)).toEqual(['Sem dados', 'Online', 'Offline', 'Alerta']);
  });

  it('esconde o status que o usuário desligou', () => {
    const labels = buildLegendItems(options({ legendOnline: false })).map((i) => i.label);
    expect(labels).not.toContain('Online');
  });

  it('itens opcionais só entram quando ligados', () => {
    const labels = buildLegendItems(options({ legendLink: true })).map((i) => i.label);
    expect(labels).toContain('Cabos');
  });

  it('tipo de host sem cor definida não vira item', () => {
    const items = buildLegendItems(
      options({ legendHostTypes: true, hostTypeColors: { router: '  ', firewall: '#123456' } })
    );
    expect(items.map((i) => i.color)).not.toContain('  ');
    expect(items.map((i) => i.color)).toContain('#123456');
  });
});
