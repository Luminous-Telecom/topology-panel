import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventBus, FieldConfigSource, LoadingState, PanelData, TimeRange, getDefaultTimeRange } from '@grafana/data';
import { Observable, Subject } from 'rxjs';
import { TopologyPanel, Props as TopologyPanelProps } from './TopologyPanel';
import { defaultOptions, TopologyMap, TopologyPanelOptions } from '../types';

/** EventBus mínimo (sem dependências do runtime real do Grafana) só para satisfazer PanelProps. */
function createTestEventBus(): EventBus {
  const subject = new Subject<never>();
  return {
    publish: () => {},
    getStream: () => subject.asObservable() as unknown as Observable<never>,
    subscribe: () => ({ unsubscribe: () => {} }),
    removeAllListeners: () => {},
    newScopedBus: () => createTestEventBus(),
  };
}

function emptyPanelData(state: LoadingState = LoadingState.Done): PanelData {
  return { state, series: [], timeRange: getDefaultTimeRange() };
}

function renderTopologyPanel(
  options: TopologyPanelOptions,
  overrides?: Partial<TopologyPanelProps>
): ReturnType<typeof render> {
  const fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };
  const timeRange: TimeRange = getDefaultTimeRange();
  const props: TopologyPanelProps = {
    id: 1,
    data: emptyPanelData(),
    timeRange,
    timeZone: 'browser',
    options,
    transparent: false,
    width: 800,
    height: 600,
    fieldConfig,
    renderCounter: 0,
    title: 'Topology',
    eventBus: createTestEventBus(),
    onOptionsChange: vi.fn(),
    onFieldConfigChange: vi.fn(),
    replaceVariables: (value: string) => value,
    onChangeTimeRange: vi.fn(),
    ...overrides,
  };
  return render(<TopologyPanel {...props} />);
}

describe('TopologyPanel — inicialização de mapas', () => {
  it('mapa em branco (sem nós) renderiza o canvas sem lançar exceção', () => {
    const options = defaultOptions();
    options.map = { width: 1200, height: 800, nodes: [], links: [] };
    expect(() => renderTopologyPanel(options)).not.toThrow();
  });

  it('mapa malformado (nodes não é array) mostra erro explícito em vez do canvas', () => {
    const options = defaultOptions();
    options.map = { width: 1200, height: 800, nodes: 'not-an-array', links: [] } as unknown as TopologyMap;
    renderTopologyPanel(options);
    expect(screen.getByText(/mapa de topologia inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/"nodes" não é uma lista/i)).toBeInTheDocument();
  });

  it('mapa malformado (width/height ausentes) mostra erro explícito', () => {
    const options = defaultOptions();
    options.map = { nodes: [], links: [] } as unknown as TopologyMap;
    renderTopologyPanel(options);
    expect(screen.getByText(/mapa de topologia inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/"width" precisa ser um número maior que zero/i)).toBeInTheDocument();
  });

  it('sem options.map (painel novo, ainda sem JSON salvo) usa o mapa padrão sem quebrar', () => {
    const options = defaultOptions();
    options.map = undefined as unknown as TopologyMap;
    expect(() => renderTopologyPanel(options)).not.toThrow();
    expect(screen.queryByText(/mapa de topologia inválido/i)).not.toBeInTheDocument();
  });

  it('query com LoadingState.Error após dado bom não deixa a UI num estado sem indicação', () => {
    const options = defaultOptions();
    options.map = { width: 1200, height: 800, nodes: [], links: [] };
    renderTopologyPanel(options, { data: emptyPanelData(LoadingState.Error) });
    expect(screen.getByText(/falha na query do painel/i)).toBeInTheDocument();
  });
});
