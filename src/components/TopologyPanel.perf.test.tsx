import React from 'react';
import { render } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataFrame,
  EventBus,
  FieldConfigSource,
  FieldType,
  LoadingState,
  PanelData,
  TimeRange,
  getDefaultTimeRange,
} from '@grafana/data';
import { Observable, Subject } from 'rxjs';
import { defaultOptions, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';

/**
 * Contador de render por forma do canvas.
 *
 * O React DevTools Profiler não roda fora do navegador; este arquivo é o equivalente headless.
 * Cada mock abaixo reaproveita a função de render original e o comparador original do
 * `React.memo`, então o número medido é exatamente quantas vezes a forma **de fato** redesenhou —
 * bail-out de memo não conta.
 */
const renderCounts = vi.hoisted(() => ({ host: 0, network: 0, link: 0 }));

/** Reempacota um `React.memo` mantendo comparador e função internos, só somando o contador. */
const countedMemo = vi.hoisted(() => {
  type AnyProps = Record<string, unknown>;
  // `<T,>` e não `<T>`: em .tsx o parser leria `<T>` como JSX.
  return async <T,>(memoComponent: T, bump: () => void): Promise<T> => {
    const reactModule = await import('react');
    const source = memoComponent as unknown as {
      type: React.FunctionComponent<AnyProps>;
      compare?: (prev: Readonly<AnyProps>, next: Readonly<AnyProps>) => boolean;
    };
    const inner = source.type;
    const counted: React.FunctionComponent<AnyProps> = (props) => {
      bump();
      return reactModule.createElement(inner, props);
    };
    return reactModule.memo(counted, source.compare) as unknown as T;
  };
});

vi.mock('./canvas/HostNodeShape', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./canvas/HostNodeShape')>();
  return { ...mod, HostNodeShape: await countedMemo(mod.HostNodeShape, () => (renderCounts.host += 1)) };
});

/** Props recebidas pela camada de hosts, para diagnosticar o que invalida o `React.memo` dela. */
const layerPropsLog = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('./canvas/NodeLayers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./canvas/NodeLayers')>();
  const reactModule = await import('react');
  const Original = mod.HostNodesLayer;
  const Spy = (props: React.ComponentProps<typeof Original>) => {
    layerPropsLog.push({ ...props } as Record<string, unknown>);
    return reactModule.createElement(Original, props);
  };
  return { ...mod, HostNodesLayer: Spy };
});

vi.mock('./canvas/NetworkNodeShape', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./canvas/NetworkNodeShape')>();
  return {
    ...mod,
    NetworkNodeShape: await countedMemo(mod.NetworkNodeShape, () => (renderCounts.network += 1)),
  };
});

vi.mock('./canvas/LinkLine', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./canvas/LinkLine')>();
  return { ...mod, LinkLine: await countedMemo(mod.LinkLine, () => (renderCounts.link += 1)) };
});

/** Props recebidas pelo canvas em cada render, para diagnosticar qual delas troca de identidade. */
const canvasPropsLog = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('./TopologyCanvas', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./TopologyCanvas')>();
  const reactModule = await import('react');
  const Original = mod.TopologyCanvas;
  const Spy = (props: React.ComponentProps<typeof Original>) => {
    canvasPropsLog.push({ ...props } as Record<string, unknown>);
    return reactModule.createElement(Original, props);
  };
  return { ...mod, TopologyCanvas: Spy };
});

const queryIndexState = vi.hoisted(() => ({
  index: undefined as import('../services/queryIndex').QueryIndex | undefined,
  ready: true,
  error: undefined as string | undefined,
}));

vi.mock('../hooks/useTopologyQueryIndex', async () => {
  const { buildQueryIndex } = await import('../services/queryIndex');
  const empty = buildQueryIndex(undefined);
  const emptyProblems = {};
  return {
    useTopologyQueryIndex: (opts: { panelData?: import('@grafana/data').PanelData }) => {
      if (opts.panelData?.series?.length) {
        const fromData = buildQueryIndex(opts.panelData);
        if (fromData.hosts.length) {
          return { index: fromData, problems: emptyProblems, lastValues: {}, interfaceItems: [], ready: true, loading: false, error: undefined };
        }
      }
      return {
        index: queryIndexState.index ?? empty,
        problems: emptyProblems,
        lastValues: {},
        interfaceItems: [],
        ready: queryIndexState.ready,
        loading: false,
        error: queryIndexState.error,
      };
    },
  };
});

// Importado depois dos mocks para que o canvas resolva as formas já instrumentadas.
import { TopologyPanel, Props as TopologyPanelProps } from './TopologyPanel';
import { buildZabbixDirectIndex } from '../services/zabbixDirectIndex';

/** Props cuja identidade mudou entre o último render antes do poll e o primeiro depois. */
function propsThatChangedIdentity(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (!Object.is(before[key], after[key])) {
      changed.push(key);
    }
  }
  return changed.sort();
}

const HOST_COUNT = 300;
const VIEWPORT_W = 1200;
const VIEWPORT_H = 800;

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

function hostIp(i: number): string {
  return `10.0.${Math.floor(i / 254)}.${(i % 254) + 1}`;
}

/** Mapa de teste: grade de hosts encadeados, tamanho de rede real de campo. */
function buildMap(hostCount: number): TopologyMap {
  const nodes: TopologyNode[] = [];
  const perRow = 20;
  for (let i = 0; i < hostCount; i += 1) {
    nodes.push({
      id: `host-${i}`,
      type: 'host',
      x: 80 + (i % perRow) * 220,
      y: 80 + Math.floor(i / perRow) * 160,
      label: `RB-${i}`,
      zabbixHost: hostIp(i),
      subtitle: hostIp(i),
    });
  }
  const links = [];
  for (let i = 1; i < hostCount; i += 1) {
    links.push({ from: `host-${i - 1}`, to: `host-${i}` });
  }
  return { width: 6000, height: 3000, nodes, links, networksLocked: true };
}

/**
 * `PanelData` novo a cada chamada, como o Grafana entrega a cada refresh.
 * `changedHosts` troca o valor só desses índices — o resto repete o valor anterior.
 */
function buildPanelData(hostCount: number, changedHosts: ReadonlySet<number> = new Set()): PanelData {
  const series: DataFrame[] = [];
  for (let i = 0; i < hostCount; i += 1) {
    const value = changedHosts.has(i) ? 0 : 1;
    series.push({
      refId: 'A',
      name: hostIp(i),
      length: 1,
      fields: [
        { name: 'time', type: FieldType.time, config: {}, values: [1700000000000] },
        {
          name: 'value',
          type: FieldType.number,
          config: {},
          labels: { host: hostIp(i) },
          values: [value],
        },
      ],
    });
  }
  return {
    state: LoadingState.Done,
    series,
    timeRange: getDefaultTimeRange(),
    request: {
      requestId: 'perf',
      interval: '1m',
      intervalMs: 60000,
      range: getDefaultTimeRange(),
      scopedVars: {},
      targets: [{ refId: 'A' }],
      timezone: 'browser',
      app: 'dashboard',
      startTime: 0,
    },
  } as PanelData;
}

function panelProps(options: TopologyPanelOptions, data: PanelData): TopologyPanelProps {
  const fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };
  const timeRange: TimeRange = getDefaultTimeRange();
  return {
    id: 1,
    data,
    timeRange,
    timeZone: 'browser',
    options,
    transparent: false,
    width: VIEWPORT_W,
    height: VIEWPORT_H,
    fieldConfig,
    renderCounter: 0,
    title: 'Topology',
    eventBus: createTestEventBus(),
    onOptionsChange: vi.fn(),
    onFieldConfigChange: vi.fn(),
    replaceVariables: (value: string) => value,
    onChangeTimeRange: vi.fn(),
  };
}

function buildDirectIndex(hostCount: number, downHosts: ReadonlySet<number> = new Set()) {
  const hosts = [];
  const statusItems = [];
  for (let i = 0; i < hostCount; i += 1) {
    const ip = hostIp(i);
    hosts.push({
      hostid: String(i),
      host: ip,
      name: `RB-${i}`,
      ip,
      groups: ['A'],
    });
    statusItems.push({
      itemid: `item-${i}`,
      hostid: String(i),
      key_: 'icmpping',
      lastvalue: downHosts.has(i) ? '0' : '1',
    });
  }
  return buildZabbixDirectIndex({
    datasourceUid: 'ds-perf',
    groupNames: ['A'],
    statusItemKey: 'icmpping',
    hosts,
    statusItems,
  });
}

/**
 * jsdom não faz layout. Sem medir o painel, a viewport fica 0x0, o fit de entrada não roda e o
 * recorte por viewport deixaria só um punhado de nós — o que esvaziaria a medição. Com a medida
 * real o mapa inteiro entra na tela, que é o pior caso para o custo de um poll.
 */
let restoreClientSize: () => void;

beforeAll(() => {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT_W });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT_H });
  restoreClientSize = () => {
    if (width) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', width);
    }
    if (height) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', height);
    }
  };
});

afterAll(() => restoreClientSize());

function resetCounts(): void {
  renderCounts.host = 0;
  renderCounts.network = 0;
  renderCounts.link = 0;
  canvasPropsLog.length = 0;
  layerPropsLog.length = 0;
}

beforeEach(() => {
  resetCounts();
  queryIndexState.index = buildDirectIndex(HOST_COUNT);
  queryIndexState.ready = true;
  queryIndexState.error = undefined;
});

function perfOptions(map: TopologyMap): TopologyPanelOptions {
  const options = defaultOptions();
  options.map = map;
  options.zabbixDatasourceUid = 'ds-perf';
  options.displayQueryRefIds = ['A'];
  return options;
}

describe(`custo de re-render do mapa (${HOST_COUNT} hosts)`, () => {
  it('poll sem nenhuma mudança de status não deve redesenhar nó nem cabo', () => {
    const map = buildMap(HOST_COUNT);
    const options = perfOptions(map);
    const { rerender } = render(<TopologyPanel {...panelProps(options, buildPanelData(HOST_COUNT))} />);

    const mounted = { ...renderCounts };
    expect(mounted.host).toBeGreaterThan(0);

    resetCounts();
    // Poll do Zabbix: mesmo índice, PanelData novo (timeRange do dashboard).
    rerender(<TopologyPanel {...panelProps(options, buildPanelData(HOST_COUNT))} />);

    // eslint-disable-next-line no-console
    console.log(
      `[perf] montagem: ${mounted.host} hosts / ${mounted.link} cabos | ` +
        `poll sem mudança: ${renderCounts.host} hosts / ${renderCounts.link} cabos`
    );

    expect(renderCounts.host).toBe(0);
    expect(renderCounts.link).toBe(0);
  });

  it('poll sem mudança mantém a identidade dos dados que descem para as camadas', () => {
    const map = buildMap(HOST_COUNT);
    const options = perfOptions(map);
    const { rerender } = render(<TopologyPanel {...panelProps(options, buildPanelData(HOST_COUNT))} />);

    // Último render antes do poll — o mount tem duas fases (antes e depois do fit de entrada).
    const before = canvasPropsLog[canvasPropsLog.length - 1];
    const layerBefore = layerPropsLog[layerPropsLog.length - 1];
    canvasPropsLog.length = 0;
    layerPropsLog.length = 0;

    rerender(<TopologyPanel {...panelProps(options, buildPanelData(HOST_COUNT))} />);
    const after = canvasPropsLog[0];

    const changed = propsThatChangedIdentity(before, after);
    // eslint-disable-next-line no-console
    console.log(`[perf] props do canvas que trocaram de identidade no poll: ${changed.join(', ') || '(nenhuma)'}`);

    // Camada que nem renderizou de novo é o caso ótimo: nada para comparar.
    const layerAfter = layerPropsLog[layerPropsLog.length - 1];
    const layerChanged = layerAfter ? propsThatChangedIdentity(layerBefore, layerAfter) : [];
    // eslint-disable-next-line no-console
    console.log(
      `[perf] renders da camada de hosts no poll: ${layerPropsLog.length} | ` +
        `props trocadas: ${layerChanged.join(', ') || '(nenhuma)'}`
    );

    /**
     * `queryData` é o `PanelData` novo (timeRange) e os `on*` são callbacks do painel — os dois
     * fazem o canvas renderizar de novo, o que é barato. O que não pode mudar é o dado que desce
     * para as camadas, porque aí o custo é por nó.
     */
    const dataProps = changed.filter((key) => key !== 'queryData' && !key.startsWith('on'));
    expect(dataProps).toEqual([]);
    // Nenhuma prop da camada de hosts muda: o `React.memo` dela segura o poll inteiro.
    expect(layerChanged).toEqual([]);
  });

  it('poll com um host mudando de status redesenha só esse host', () => {
    const map = buildMap(HOST_COUNT);
    const options = perfOptions(map);
    const { rerender } = render(<TopologyPanel {...panelProps(options, buildPanelData(HOST_COUNT))} />);

    resetCounts();
    rerender(<TopologyPanel {...panelProps(options, buildPanelData(HOST_COUNT, new Set([7])))} />);

    // eslint-disable-next-line no-console
    console.log(
      `[perf] poll com 1 host mudando: ${renderCounts.host} hosts / ${renderCounts.link} cabos`
    );

    expect(renderCounts.host).toBe(1);
  });
});
