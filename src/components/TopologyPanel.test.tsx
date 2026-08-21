import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, FieldConfigSource, LoadingState, PanelData, TimeRange, getDefaultTimeRange } from '@grafana/data';
import { Observable, Subject } from 'rxjs';
import { TopologyPanel, Props as TopologyPanelProps } from './TopologyPanel';
import { defaultOptions, TopologyMap, TopologyPanelOptions } from '../types';

const directIndexMock = vi.hoisted(() => ({
  error: undefined as string | undefined,
}));

vi.mock('../hooks/useZabbixDirectIndex', async () => {
  const { buildQueryIndex } = await import('../services/queryIndex');
  const empty = buildQueryIndex(undefined);
  return {
    useZabbixDirectIndex: () => ({
      index: empty,
      ready: !directIndexMock.error,
      loading: false,
      error: directIndexMock.error,
    }),
  };
});

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
  beforeEach(() => {
    directIndexMock.error = undefined;
  });

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

  it('erro do Zabbix não deixa a UI sem indicação', () => {
    directIndexMock.error = 'Falha ao consultar o Zabbix.';
    const options = defaultOptions();
    options.map = { width: 1200, height: 800, nodes: [], links: [] };
    renderTopologyPanel(options);
    expect(screen.getByText(/falha na fonte de dados/i)).toBeInTheDocument();
  });

  it('mapa com rede, host, submapa e cabo desenha todas as camadas', () => {
    const options = defaultOptions();
    options.map = {
      width: 1200,
      height: 800,
      nodes: [
        { id: 'rede-1', type: 'network', x: 100, y: 100, width: 300, height: 200, label: 'Sala 1' },
        { id: 'host-1', type: 'host', x: 150, y: 150, label: 'RB-01', subtitle: '10.0.0.1' },
        { id: 'submapa-1', type: 'submap', x: 500, y: 150, label: 'Filial' },
      ],
      links: [{ from: 'host-1', to: 'submapa-1' }],
    };
    renderTopologyPanel(options);
    expect(screen.getByText('Sala 1')).toBeInTheDocument();
    expect(screen.getByText('RB-01')).toBeInTheDocument();
    expect(screen.getByText('Filial')).toBeInTheDocument();
  });
});
