import { describe, expect, it } from 'vitest';
import { TopologyStatusValueMapping } from '../types';
import {
  resolveHostStatusDisplay,
  resolveHostStatusFromValue,
  resolveMappingLabel,
  resolveStatusColor,
  StatusColorOptions,
} from './statusMapping';

const colors: StatusColorOptions = {
  colorOnline: '#2E7D32',
  colorOffline: '#C62828',
  colorAlert: '#F9A825',
  statusValueMappings: [],
};

describe('resolveHostStatusFromValue', () => {
  it('valor não finito (NaN/Infinity) não casa com nenhum mapeamento', () => {
    const mappings: TopologyStatusValueMapping[] = [{ value: 0, status: 'online' }];
    expect(resolveHostStatusFromValue(NaN, mappings)).toBeUndefined();
    expect(resolveHostStatusFromValue(Infinity, mappings)).toBeUndefined();
  });

  it('casa por valor exato', () => {
    const mappings: TopologyStatusValueMapping[] = [
      { value: 0, status: 'online' },
      { value: 1, status: 'offline' },
    ];
    expect(resolveHostStatusFromValue(0, mappings)).toBe('online');
    expect(resolveHostStatusFromValue(1, mappings)).toBe('offline');
    expect(resolveHostStatusFromValue(2, mappings)).toBeUndefined();
  });

  it('casa por faixa from/to (limites inclusivos)', () => {
    const mappings: TopologyStatusValueMapping[] = [{ from: 1, to: 5, status: 'alert' }];
    expect(resolveHostStatusFromValue(1, mappings)).toBe('alert');
    expect(resolveHostStatusFromValue(5, mappings)).toBe('alert');
    expect(resolveHostStatusFromValue(0.99, mappings)).toBeUndefined();
    expect(resolveHostStatusFromValue(5.01, mappings)).toBeUndefined();
  });

  it('faixa sem "from" cobre -infinito; sem "to" cobre +infinito', () => {
    const mappings: TopologyStatusValueMapping[] = [{ to: 0, status: 'offline' }];
    expect(resolveHostStatusFromValue(-1000, mappings)).toBe('offline');
    const openEnd: TopologyStatusValueMapping[] = [{ from: 0, status: 'online' }];
    expect(resolveHostStatusFromValue(1000, openEnd)).toBe('online');
  });

  it('valor exato 0 (Down) vence a faixa online mesmo se ela vier primeiro', () => {
    const mappings: TopologyStatusValueMapping[] = [
      { from: 0, status: 'online', label: 'Up' },
      { value: 0, status: 'offline', label: 'Down' },
    ];
    expect(resolveHostStatusFromValue(0, mappings)).toBe('offline');
    expect(resolveHostStatusFromValue(1, mappings)).toBe('online');
    expect(resolveMappingLabel(0, mappings)).toBe('Down');
  });

  it('lastvalue 0 é offline quando a faixa online começa em 0 e não há regra exata', () => {
    expect(resolveHostStatusFromValue(0, [{ from: 0, status: 'online' }])).toBe('offline');
    expect(resolveHostStatusFromValue(0, [])).toBe('offline');
  });

  it('casa valor exato gravado como texto no JSON do Grafana', () => {
    const mappings = [
      { value: '0' as unknown as number, status: 'offline' as const },
      { from: 0, status: 'online' as const },
    ];
    expect(resolveHostStatusFromValue(0, mappings)).toBe('offline');
  });

  it('mapeamento padrão pinta ping 0 como offline e 1 como online', () => {
    const mappings: TopologyStatusValueMapping[] = [
      { value: 0, status: 'offline', label: 'Down' },
      { from: 0, status: 'online', label: 'Up' },
    ];
    expect(resolveHostStatusFromValue(0, mappings)).toBe('offline');
    expect(resolveHostStatusFromValue(1, mappings)).toBe('online');
  });

  it('usa a primeira regra que casa, ignorando as seguintes', () => {
    const mappings: TopologyStatusValueMapping[] = [
      { from: 0, to: 10, status: 'online' },
      { from: 5, to: 15, status: 'alert' },
    ];
    expect(resolveHostStatusFromValue(7, mappings)).toBe('online');
  });
});

describe('resolveStatusColor', () => {
  it('resolve a cor para cada um dos 3 status', () => {
    expect(resolveStatusColor('online', colors)).toBe(colors.colorOnline);
    expect(resolveStatusColor('offline', colors)).toBe(colors.colorOffline);
    expect(resolveStatusColor('alert', colors)).toBe(colors.colorAlert);
  });
});

describe('resolveMappingLabel', () => {
  it('retorna o label da regra que casou, undefined se vazio', () => {
    const mappings: TopologyStatusValueMapping[] = [
      { value: 0, status: 'online', label: '  ' },
      { value: 1, status: 'offline', label: 'Sem resposta' },
    ];
    expect(resolveMappingLabel(0, mappings)).toBeUndefined();
    expect(resolveMappingLabel(1, mappings)).toBe('Sem resposta');
    expect(resolveMappingLabel(2, mappings)).toBeUndefined();
  });
});

describe('resolveHostStatusDisplay', () => {
  it('sem mapeamento que casa, retorna undefined', () => {
    expect(resolveHostStatusDisplay(42, colors)).toBeUndefined();
  });

  it('monta cor + texto quando o valor casa com um mapeamento', () => {
    const options: StatusColorOptions = {
      ...colors,
      statusValueMappings: [{ value: 1, status: 'offline', label: 'Perda 100%' }],
    };
    expect(resolveHostStatusDisplay(1, options)).toEqual({
      value: 1,
      status: 'offline',
      color: colors.colorOffline,
      text: 'Perda 100%',
    });
  });
});
