import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOptions, HostDisplayMap, LinkRuntimeMetrics, TopologyMap, TopologyNode, TopologyView } from '../types';
import { linkKey } from '../utils/mapLinkEdits';

/**
 * Custo de re-render de um gesto de arraste, medido como em `TopologyPanel.perf.test.tsx`:
 * cada mock reaproveita a função de render e o comparador originais, então o número medido é
 * quantas vezes a forma **de fato** redesenhou.
 */
const renderCounts = vi.hoisted(() => ({ host: 0, link: 0 }));

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

vi.mock('./canvas/links/LinkLine', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./canvas/links/LinkLine')>();
  return { ...mod, LinkLine: await countedMemo(mod.LinkLine, () => (renderCounts.link += 1)) };
});

import { TopologyCanvas } from './TopologyCanvas';

const HOST_COUNT = 300;
const VIEWPORT_W = 1200;
const VIEWPORT_H = 800;

let restoreClientSize: () => void;

beforeAll(() => {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT_W });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT_H });
  // jsdom só aceita capture de um pointerId ativo — o gesto de teste não passa por hit testing.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
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

const STABLE_HOST_DISPLAY_BY_REF_ID: Record<string, HostDisplayMap> = {};
const STABLE_SUBMAP_HOSTS: Record<string, string[] | undefined> = {};

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
      zabbixHost: `10.0.0.${i}`,
    });
  }
  const links = [];
  for (let i = 1; i < hostCount; i += 1) {
    links.push({ from: `host-${i - 1}`, to: `host-${i}` });
  }
  return { width: 6000, height: 3000, nodes, links, networksLocked: true };
}

function canvasElement(map: TopologyMap, savedView?: TopologyView) {
  return (
    <TopologyCanvas
      map={map}
      storedMap={map}
      options={defaultOptions()}
      hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
      submapHosts={STABLE_SUBMAP_HOSTS}
      mapNavigationKey="root"
      savedView={savedView}
      // `onMapChange` é o que liga o modo editável do canvas (`canPersist`).
      onMapChange={() => {}}
    />
  );
}

function renderEditableCanvas(map: TopologyMap, savedView?: TopologyView) {
  return render(canvasElement(map, savedView));
}

beforeEach(() => {
  renderCounts.host = 0;
  renderCounts.link = 0;
});

describe(`custo de re-render de um gesto (${HOST_COUNT} hosts)`, () => {
    it('arrastar um nó redesenha só ele e os cabos ligados a ele', async () => {
    const map = buildMap(HOST_COUNT);
    const { container } = renderEditableCanvas(map);

    const target = container.querySelector('[data-node-id="host-5"]');
    expect(target).not.toBeNull();
    if (!target) {
      return;
    }

    fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    renderCounts.host = 0;
    renderCounts.link = 0;

    // 6 passos além do limiar de arraste (4 px), como um pointermove por frame.
    const MOVES = 6;
    for (let step = 1; step <= MOVES; step += 1) {
      fireEvent.pointerMove(target, { pointerId: 1, clientX: 100 + step * 10, clientY: 100 + step * 10 });
      // O preview só commita no rAF (`useGestureFrame` + store). Sem esperar, o teste não via o gesto.
      await act(async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `[perf] ${MOVES} passos de arraste: ${renderCounts.host} renders de host ` +
        `(${(renderCounts.host / MOVES).toFixed(1)}/passo), ${renderCounts.link} de cabo ` +
        `(${(renderCounts.link / MOVES).toFixed(1)}/passo)`
    );

    // O nó arrastado nunca pode ser recortado no meio do gesto.
    expect(container.querySelector('[data-node-id="host-5"]')).not.toBeNull();

    /**
     * host-5 tem dois cabos (host-4 e host-6). Só o nó arrastado e esses dois cabos redesenham —
     * o `+ 2` cobre o commit extra do limiar de arraste e das guias de alinhamento.
     *
     * Com os handlers de nó trocando de identidade a cada render, este mesmo gesto custava 300
     * renders de host **por passo** (1801 em 6 passos) — ver `useStableCallback`.
     */
    expect(renderCounts.host).toBeLessThanOrEqual(MOVES + 2);
    expect(renderCounts.link).toBeLessThanOrEqual(MOVES * 2 + 2);
  });
});

/**
 * Ao abrir, o canvas encaixa a topologia inteira na tela — nesse zoom **nada** fica fora da
 * viewport e o recorte não tem o que remover. O ganho aparece quando o usuário aproxima, que é o
 * que estes testes reproduzem com a roda do mouse.
 */
async function zoomIn(wrap: Element, steps: number): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    fireEvent.wheel(wrap, { deltaY: -120, clientX: 600, clientY: 400 });
  }
  // O zoom da roda comita uma vez por frame (`useCanvasZoomGestures`): sem esperar o rAF, a view
  // continua a de entrada e nada foi recortado ainda.
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function wrapOf(container: HTMLElement): Element {
  const wrap = container.querySelector('svg')?.parentElement;
  if (!wrap) {
    throw new Error('wrapper do canvas não encontrado');
  }
  return wrap;
}

describe(`recorte por viewport (${HOST_COUNT} hosts)`, () => {
  it('no zoom de entrada (mapa inteiro na tela) nada é recortado', () => {
    const map = buildMap(HOST_COUNT);
    const { container } = renderEditableCanvas(map);
    expect(container.querySelectorAll('[data-node-id]').length).toBe(HOST_COUNT);
  });

  it('aproximando o zoom, só os nós perto da viewport ficam no DOM', async () => {
    const map = buildMap(HOST_COUNT);
    const { container } = renderEditableCanvas(map);
    const before = container.querySelectorAll('svg *').length;

    await zoomIn(wrapOf(container), 25);

    const mounted = container.querySelectorAll('[data-node-id]').length;
    const after = container.querySelectorAll('svg *').length;

    // eslint-disable-next-line no-console
    console.log(
      `[perf] zoom aproximado: ${mounted}/${HOST_COUNT} nós no DOM, ` +
        `elementos SVG ${before} -> ${after}`
    );

    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(HOST_COUNT);
    expect(after).toBeLessThan(before);
  });

  it('pan curto depois do zoom não redesenha nada: o recorte é alinhado a uma grade grossa', async () => {
    const map = buildMap(HOST_COUNT);
    const { container } = renderEditableCanvas(map);
    const wrap = wrapOf(container);
    await zoomIn(wrap, 25);

    const mountedBefore = container.querySelectorAll('[data-node-id]').length;
    renderCounts.host = 0;
    renderCounts.link = 0;

    // Pan de 1 dedo bem abaixo do lado da grade de recorte (512 unidades do mundo).
    fireEvent.pointerDown(wrap, { pointerId: 2, button: 0, clientX: 500, clientY: 400 });
    for (let step = 1; step <= 5; step += 1) {
      fireEvent.pointerMove(wrap, { pointerId: 2, clientX: 500 - step * 8, clientY: 400 });
    }
    fireEvent.pointerUp(wrap, { pointerId: 2 });

    // eslint-disable-next-line no-console
    console.log(
      `[perf] pan curto: ${renderCounts.host} renders de host, ${renderCounts.link} de cabo, ` +
        `${container.querySelectorAll('[data-node-id]').length}/${mountedBefore} nós no DOM`
    );

    expect(renderCounts.host).toBe(0);
    expect(renderCounts.link).toBe(0);
  });

  it('mapa pequeno não é recortado nem depois de aproximar', async () => {
    const small = buildMap(20);
    const { container } = renderEditableCanvas(small);
    await zoomIn(wrapOf(container), 25);
    expect(container.querySelectorAll('[data-node-id]').length).toBe(20);
  });
});

describe('poll de tráfego no cabo', () => {
  function twoHostMap(): TopologyMap {
    return {
      width: 800,
      height: 400,
      nodes: [
        { id: 'host-0', type: 'host', x: 80, y: 80, label: 'A', zabbixHost: '10.0.0.1' },
        { id: 'host-1', type: 'host', x: 400, y: 80, label: 'B', zabbixHost: '10.0.0.2' },
      ],
      links: [{ from: 'host-0', to: 'host-1' }],
      networksLocked: true,
    };
  }

  function paint(link: TopologyMap['links'][0], pct: number, rxBps: number): Record<string, LinkRuntimeMetrics> {
    const endpoint = {
      rxBps,
      txBps: rxBps,
      rxUtilizationPct: pct,
      txUtilizationPct: pct,
      operStatus: 'up' as const,
      capacityMbps: 1000,
    };
    return {
      [linkKey(link)]: { status: 'up', from: endpoint, to: { ...endpoint } },
    };
  }

  function canvasWithMetrics(map: TopologyMap, linkMetricsByLink: Record<string, LinkRuntimeMetrics>) {
    return (
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={defaultOptions()}
        hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
        submapHosts={STABLE_SUBMAP_HOSTS}
        mapNavigationKey="root"
        queryReady
        linkMetricsByLink={linkMetricsByLink}
        onMapChange={() => {}}
      />
    );
  }

  it('bps novo na mesma faixa não redesenha o cabo', () => {
    const map = twoHostMap();
    const link = map.links[0]!;
    const { rerender } = render(canvasWithMetrics(map, paint(link, 10, 1_000_000)));
    renderCounts.link = 0;
    rerender(canvasWithMetrics(map, paint(link, 12, 4_000_000)));
    expect(renderCounts.link).toBe(0);
  });

  it('cruzar a faixa de utilização redesenha o cabo', () => {
    const map = twoHostMap();
    const link = map.links[0]!;
    const { rerender } = render(canvasWithMetrics(map, paint(link, 10, 1_000_000)));
    renderCounts.link = 0;
    rerender(canvasWithMetrics(map, paint(link, 95, 900_000_000)));
    expect(renderCounts.link).toBe(1);
  });
});
