import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultOptions, HostDisplayMap, TopologyMap, TopologyNode, TopologyView } from '../types';

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

vi.mock('./canvas/LinkLine', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./canvas/LinkLine')>();
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
  it('arrastar um nó redesenha só ele e os cabos ligados a ele', () => {
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
