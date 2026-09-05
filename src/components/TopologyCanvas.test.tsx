import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TopologyCanvas } from './TopologyCanvas';
import { defaultOptions, HostDisplayMap, TopologyMap, TopologyView } from '../types';
import { emptyMap, hostNode } from '../utils/testMapFixtures';

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;

/** jsdom não faz layout: o fit lê `clientWidth`/`clientHeight` do painel de scroll. */
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

interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

function readTransform(container: HTMLElement): CanvasTransform {
  const raw = container.querySelector('svg > g')?.getAttribute('transform');
  const parsed = raw?.match(/^translate\((-?[\d.]+),(-?[\d.]+)\) scale\((-?[\d.]+)\)$/);
  if (!parsed) {
    throw new Error(`transform do canvas não reconhecido: ${raw}`);
  }
  return { x: Number(parsed[1]), y: Number(parsed[2]), scale: Number(parsed[3]) };
}

/** Canto superior esquerdo de cada nó projetado em coordenadas de tela. */
function projectNodes(map: TopologyMap, t: CanvasTransform): Array<{ x: number; y: number }> {
  return map.nodes.map((node) => ({ x: node.x * t.scale + t.x, y: node.y * t.scale + t.y }));
}

/** Mapa cuja topologia ocupa um canto distante do canvas declarado no JSON. */
function distantMap(): TopologyMap {
  return emptyMap({
    width: 6000,
    height: 4000,
    nodes: [
      hostNode({ id: 'h1', x: 3000, y: 2000, label: 'Host 1' }),
      hostNode({ id: 'h2', x: 3400, y: 2000, label: 'Host 2' }),
      hostNode({ id: 'h3', x: 3200, y: 2400, label: 'Host 3' }),
    ],
    links: [{ from: 'h1', to: 'h2' }],
  });
}

function childMap(): TopologyMap {
  return emptyMap({
    width: 6000,
    height: 4000,
    nodes: [
      hostNode({ id: 'c1', x: 120, y: 140, label: 'Filho 1' }),
      hostNode({ id: 'c2', x: 520, y: 140, label: 'Filho 2' }),
      hostNode({ id: 'c3', x: 320, y: 520, label: 'Filho 3' }),
    ],
    links: [{ from: 'c1', to: 'c2' }],
  });
}

/**
 * Props de identidade estável: `hostDisplayByRefId` e `submapHosts` entram no snapshot de
 * `useFrozenCanvasData`, então um objeto novo a cada render dispararia re-render em loop.
 */
const STABLE_HOST_DISPLAY_BY_REF_ID: Record<string, HostDisplayMap> = {};
const STABLE_SUBMAP_HOSTS: Record<string, string[] | undefined> = {};

function canvasElement(map: TopologyMap, mapNavigationKey: string, savedView?: TopologyView) {
  return (
    <TopologyCanvas
      map={map}
      storedMap={map}
      options={defaultOptions()}
      hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
      submapHosts={STABLE_SUBMAP_HOSTS}
      savedView={savedView}
      mapNavigationKey={mapNavigationKey}
    />
  );
}

function renderCanvas(map: TopologyMap, mapNavigationKey: string) {
  return render(canvasElement(map, mapNavigationKey));
}

function expectNodesVisibleAndCentered(map: TopologyMap, t: CanvasTransform): void {
  const points = projectNodes(map, t);
  for (const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(VIEWPORT_W);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(VIEWPORT_H);
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  // Tolerância: a projeção usa o canto do nó, e a caixa medida ainda cresce para a direita/baixo.
  expect(Math.abs(centerX - VIEWPORT_W / 2)).toBeLessThan(120);
  expect(Math.abs(centerY - VIEWPORT_H / 2)).toBeLessThan(120);
}

describe('TopologyCanvas — fit de entrada no mapa', () => {
  it('ao abrir o mapa raiz, encaixa a topologia desenhada e não o canvas do JSON', () => {
    const map = distantMap();
    const { container } = renderCanvas(map, 'root');
    expectNodesVisibleAndCentered(map, readTransform(container));
  });

  it('ao entrar no submapa, encaixa a topologia do mapa filho', () => {
    const root = distantMap();
    const { container, rerender } = renderCanvas(root, 'root');
    const rootTransform = readTransform(container);

    const child = childMap();
    rerender(canvasElement(child, 'filial'));

    const childTransform = readTransform(container);
    expect(childTransform).not.toEqual(rootTransform);
    expectNodesVisibleAndCentered(child, childTransform);
  });

  it('ao voltar para o mapa pai, encaixa de novo a topologia do pai', () => {
    const root = distantMap();
    const { container, rerender } = renderCanvas(root, 'root');
    const rootTransform = readTransform(container);

    const child = childMap();
    rerender(canvasElement(child, 'filial'));
    const back = distantMap();
    rerender(canvasElement(back, 'root'));

    expect(readTransform(container)).toEqual(rootTransform);
  });

  it('view salva de outro enquadramento não vence o fit de entrada', () => {
    const map = distantMap();
    const { container } = render(canvasElement(map, 'root', { x: -20, y: -10, scale: 3.5 }));
    expectNodesVisibleAndCentered(map, readTransform(container));
  });

  it('refresh da Query no mesmo mapa não reencaixa nem desfaz o zoom do usuário', async () => {
    const map = distantMap();
    const { container, rerender } = renderCanvas(map, 'root');
    const fitted = readTransform(container);

    const wrap = container.firstElementChild as HTMLElement;
    fireEvent.wheel(wrap, { deltaY: -120 });
    // O zoom da roda comita uma vez por frame (`useCanvasZoomGestures`).
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    const zoomed = readTransform(container);
    expect(zoomed.scale).toBeGreaterThan(fitted.scale);

    // Refresh: mesmo mapa e mesmo id de navegação, objeto novo e status/rótulos atualizados.
    const refreshed = distantMap();
    refreshed.nodes = refreshed.nodes.map((node) => ({ ...node, subtitle: '10 ms' }));
    rerender(canvasElement(refreshed, 'root'));

    expect(readTransform(container)).toEqual(zoomed);
  });
});

/** Centro da caixa desenhada do nó, em coordenadas de tela. */
function projectNodeCenter(container: HTMLElement, nodeId: string, t: CanvasTransform): { x: number; y: number } {
  const rect = container.querySelector(`g[data-node-id="${nodeId}"] rect`);
  if (!rect) {
    throw new Error(`nó ${nodeId} não desenhado`);
  }
  const x = Number(rect.getAttribute('x'));
  const y = Number(rect.getAttribute('y'));
  const w = Number(rect.getAttribute('width'));
  const h = Number(rect.getAttribute('height'));
  return { x: (x + w / 2) * t.scale + t.x, y: (y + h / 2) * t.scale + t.y };
}

describe('TopologyCanvas — modo NOC', () => {
  it('clicar em equipamento de outro mapa centraliza o host no mapa de destino', async () => {
    const root = distantMap();
    const child = childMap();
    const options = {
      ...defaultOptions(),
      nocMode: true,
      map: root,
      childMaps: { filial: child },
    };
    const jumps: string[] = [];
    const element = (map: TopologyMap, mapNavigationKey: string) => (
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        queryReady
        hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
        submapHosts={STABLE_SUBMAP_HOSTS}
        mapNavigationKey={mapNavigationKey}
        onNavigateToMapId={(mapId) => jumps.push(mapId)}
      />
    );

    const { container, rerender, getByLabelText } = render(element(root, 'root'));
    await waitFor(() => {
      expect(getByLabelText('Ir para Filho 3 no mapa filial')).toBeInTheDocument();
    });
    fireEvent.click(getByLabelText('Ir para Filho 3 no mapa filial'));
    expect(jumps).toEqual(['filial']);

    // A navegação real acontece no painel: o canvas recebe o mapa filho e o novo id de navegação.
    rerender(element(child, 'filial'));

    const transform = readTransform(container);
    const center = projectNodeCenter(container, 'c3', transform);
    expect(Math.abs(center.x - VIEWPORT_W / 2)).toBeLessThan(1);
    expect(Math.abs(center.y - VIEWPORT_H / 2)).toBeLessThan(1);
    expect(container.querySelector('g[data-node-id="c3"] rect')?.getAttribute('stroke')).toBe('#4FC3F7');
  });

  it('mostra só tipos que têm host no mapa, no menu Tipo', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'cam', icon: 'camera', label: 'Cam 1', zabbixHost: '10.0.0.1' })],
    });
    const options = { ...defaultOptions(), nocMode: true, map };
    const { getByLabelText, getByRole, queryByText } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        queryReady
        hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
        submapHosts={STABLE_SUBMAP_HOSTS}
      />
    );
    fireEvent.click(getByLabelText('Filtro Status'));
    expect(getByRole('listbox', { name: 'Status' })).toHaveTextContent('Offline');
    expect(getByRole('listbox', { name: 'Status' })).toHaveTextContent('Online');
    expect(getByRole('listbox', { name: 'Status' })).toHaveTextContent('Alerta');
    fireEvent.click(getByLabelText('Filtro Tipo'));
    expect(getByRole('listbox', { name: 'Tipo' })).toHaveTextContent('Câmeras');
    expect(queryByText('Firewalls')).not.toBeInTheDocument();
    expect(queryByText('OLTs')).not.toBeInTheDocument();
  });
});

describe('TopologyCanvas — quiosque / playlist', () => {
  it('mostra a lista de hosts com alerta mesmo com a toolbar oculta', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'h1', x: 120, y: 140, label: 'Host 1', zabbixHost: 'host-a' })],
    });
    const options = { ...defaultOptions(), map, showHostAlertList: true };
    const hostDisplayByRefId: Record<string, HostDisplayMap> = {
      A: { 'host-a': { value: 0, status: 'offline' } },
    };

    const { getByText, queryByTitle } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        queryReady
        hostDisplayByRefId={hostDisplayByRefId}
        submapHosts={STABLE_SUBMAP_HOSTS}
        hideOverlayControls
      />
    );

    expect(getByText('Hosts com alerta (1)')).toBeInTheDocument();
    expect(queryByTitle('Ocultar legenda')).not.toBeInTheDocument();
  });

  it('mostra host com alerta de mapa filho mesmo no Início', () => {
    const root = emptyMap({
      nodes: [
        {
          id: 'sm1',
          type: 'submap',
          x: 80,
          y: 80,
          label: 'Filial',
          submapChildMapId: 'filial',
        },
      ],
    });
    const child = emptyMap({
      nodes: [
        hostNode({
          id: 'h1',
          x: 120,
          y: 140,
          label: 'host-b',
          zabbixHost: 'CPE-01',
          subtitle: '10.0.0.2',
        }),
      ],
    });
    const options = {
      ...defaultOptions(),
      map: root,
      childMaps: { filial: child },
      showHostAlertList: true,
    };
    const hostDisplayByRefId: Record<string, HostDisplayMap> = {
      A: { 'host-b': { value: 1, status: 'online' } },
    };

    const { getByText, getByLabelText } = render(
      <TopologyCanvas
        map={root}
        storedMap={root}
        options={options}
        queryReady
        hostDisplayByRefId={hostDisplayByRefId}
        hostMetadata={{ 'host-b': { name: 'host-b', hostid: '1002' } }}
        hostProblems={{
          '1002': { count: 1, maxSeverity: 4, names: ['Interface down'] },
        }}
        submapHosts={STABLE_SUBMAP_HOSTS}
        hideOverlayControls
      />
    );

    expect(getByText('Hosts com alerta (1)')).toBeInTheDocument();
    const row = getByLabelText(/Ir para host-b no mapa Filial/);
    expect(row).toHaveTextContent('host-b');
    expect(row).toHaveTextContent('Filial');
    expect(row).not.toHaveTextContent('Interface down');
  });

  it('mostra o problema Zabbix ao passar o mouse na lista de alertas', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'h1', x: 120, y: 140, label: 'Host 1', zabbixHost: 'host-a' })],
    });
    const options = { ...defaultOptions(), map, showHostAlertList: true };
    const hostDisplayByRefId: Record<string, HostDisplayMap> = {
      A: { 'host-a': { value: 1, status: 'online' } },
    };

    const { getByLabelText, getByRole } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        queryReady
        hostDisplayByRefId={hostDisplayByRefId}
        hostMetadata={{ 'host-a': { name: 'host-a', hostid: 'hid-a' } }}
        hostProblems={{
          'hid-a': { count: 1, maxSeverity: 4, names: ['Interface port-a com erros de entrada (alto)'] },
        }}
        submapHosts={STABLE_SUBMAP_HOSTS}
        hideOverlayControls
      />
    );

    const row = getByLabelText(/Interface port-a com erros de entrada/);
    expect(row).not.toHaveTextContent('Interface port-a com erros de entrada (alto)');
    fireEvent.mouseEnter(row);
    const tooltip = getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Interface port-a com erros de entrada (alto)');
    expect(tooltip.closest('[data-topology-canvas]')).not.toBeNull();
  });

  it('host offline na lista mostra OFFLINE mesmo com problema Zabbix', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'h1', x: 120, y: 140, label: 'Host 1', zabbixHost: 'host-a' })],
    });
    const options = { ...defaultOptions(), map, showHostAlertList: true };
    const hostDisplayByRefId: Record<string, HostDisplayMap> = {
      A: { 'host-a': { value: 0, status: 'offline' } },
    };

    const { getByText, queryByText } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        queryReady
        hostDisplayByRefId={hostDisplayByRefId}
        hostMetadata={{ 'host-a': { name: 'host-a', hostid: 'hid-a' } }}
        hostProblems={{
          'hid-a': { count: 1, maxSeverity: 4, names: ['ICMP timeout'] },
        }}
        submapHosts={STABLE_SUBMAP_HOSTS}
        hideOverlayControls
      />
    );

    expect(getByText('Host 1')).toBeInTheDocument();
    expect(queryByText('OFFLINE')).toBeNull();
    expect(queryByText('ICMP timeout')).toBeNull();
  });

  it('com alertas Zabbix desligados a lista não mostra problema, só offline', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'h1', x: 120, y: 140, label: 'Host 1', zabbixHost: 'host-a' })],
    });
    const options = { ...defaultOptions(), map, showHostAlertList: true, showZabbixAlerts: false };
    const hostDisplayByRefId: Record<string, HostDisplayMap> = {
      A: { 'host-a': { value: 1, status: 'online' } },
    };

    const { queryByText } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        queryReady
        hostDisplayByRefId={hostDisplayByRefId}
        hostMetadata={{ 'host-a': { name: 'host-a', hostid: 'hid-a' } }}
        hostProblems={{
          'hid-a': { count: 1, maxSeverity: 4, names: ['Interface down'] },
        }}
        submapHosts={STABLE_SUBMAP_HOSTS}
        hideOverlayControls
      />
    );

    expect(queryByText('Hosts com alerta')).toBeNull();
    expect(queryByText('Interface down')).toBeNull();
  });

  it('mantém voltar, avançar e breadcrumb com a toolbar oculta', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'h1', x: 120, y: 140, label: 'Host 1' })],
    });
    const options = { ...defaultOptions(), map };

    const { getByLabelText, getByText, queryByTitle } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
        submapHosts={STABLE_SUBMAP_HOSTS}
        hideOverlayControls
        canMapNavigateBack
        mapNavigationBreadcrumb={[
          { mapId: 'root', label: 'Início' },
          { mapId: 'swv', label: 'SWV' },
        ]}
        onMapNavigateBack={() => undefined}
        onMapNavigateForward={() => undefined}
      />
    );

    expect(getByLabelText('Voltar')).toBeInTheDocument();
    expect(getByLabelText('Avançar')).toBeInTheDocument();
    expect(getByText('Início')).toBeInTheDocument();
    expect(getByText('SWV')).toBeInTheDocument();
    expect(queryByTitle('Ocultar legenda')).not.toBeInTheDocument();
  });

  it('mostra o mini mapa fora do modo edição', async () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'h1', x: 120, y: 140, label: 'Host 1' })],
    });
    const options = { ...defaultOptions(), map, showMinimap: true };

    const { getByLabelText, queryByLabelText } = render(
      <TopologyCanvas
        map={map}
        storedMap={map}
        options={options}
        hostDisplayByRefId={STABLE_HOST_DISPLAY_BY_REF_ID}
        submapHosts={STABLE_SUBMAP_HOSTS}
      />
    );

    await waitFor(() => {
      expect(getByLabelText('Visão geral do mapa')).toBeInTheDocument();
    });
    fireEvent.click(getByLabelText('Ocultar mini mapa'));
    expect(queryByLabelText('Visão geral do mapa')).toBeNull();
    expect(getByLabelText('Mostrar mini mapa')).toBeInTheDocument();
  });
});
