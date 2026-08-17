import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { emptyMap } from './testMapFixtures';
import {
  ROOT_MAP_ID,
  applyTopologyMapToPanelOptions,
  buildTopologyBreadcrumb,
  computeBreadcrumbNavigation,
  isValidChildMapId,
  resolveTopologyMapById,
  resolveTopologyMapView,
} from './topologyMapNavigation';

describe('isValidChildMapId', () => {
  it('aceita letras, números, hífen e underscore', () => {
    expect(isValidChildMapId('map-fortaleza_01')).toBe(true);
  });

  it('rejeita id vazio ou com espaços', () => {
    expect(isValidChildMapId('')).toBe(false);
    expect(isValidChildMapId('mapa interno')).toBe(false);
  });
});

describe('resolveTopologyMapById', () => {
  it('retorna o mapa raiz para ROOT_MAP_ID', () => {
    const options = defaultOptions();
    expect(resolveTopologyMapById(options, ROOT_MAP_ID)).toBe(options.map);
  });

  it('retorna mapa filho quando o id existe em childMaps', () => {
    const child = emptyMap();
    const options = { ...defaultOptions(), childMaps: { nordeste: child } };
    expect(resolveTopologyMapById(options, 'nordeste')).toBe(child);
  });

  it('retorna null quando o mapa filho não existe', () => {
    expect(resolveTopologyMapById(defaultOptions(), 'inexistente')).toBeNull();
  });
});

describe('resolveTopologyMapView', () => {
  it('usa options.view no mapa raiz', () => {
    const view = { x: 10, y: 20, scale: 1.5 };
    const options = { ...defaultOptions(), view };
    expect(resolveTopologyMapView(options, ROOT_MAP_ID, {})).toEqual(view);
  });

  it('prefere view da sessão sobre childMapViews persistida', () => {
    const persisted = { x: 1, y: 2, scale: 1 };
    const session = { x: 9, y: 8, scale: 2 };
    const options = { ...defaultOptions(), childMapViews: { filho: persisted } };
    expect(resolveTopologyMapView(options, 'filho', { filho: session })).toEqual(session);
  });
});

describe('buildTopologyBreadcrumb', () => {
  it('monta o caminho com rótulos da pilha e o mapa atual', () => {
    const trail = buildTopologyBreadcrumb(
      [
        { mapId: ROOT_MAP_ID, view: { x: 0, y: 0, scale: 1 }, label: 'Brasil' },
        { mapId: 'ne', view: { x: 0, y: 0, scale: 1 }, label: 'Nordeste' },
      ],
      'fortaleza',
      'Fortaleza'
    );
    expect(trail).toEqual([
      { mapId: ROOT_MAP_ID, label: 'Brasil' },
      { mapId: 'ne', label: 'Nordeste' },
      { mapId: 'fortaleza', label: 'Fortaleza' },
    ]);
  });

  it('fica vazio no mapa raiz sem navegação', () => {
    expect(buildTopologyBreadcrumb([], ROOT_MAP_ID, '')).toEqual([]);
  });
});

describe('computeBreadcrumbNavigation', () => {
  const view = { x: 0, y: 0, scale: 1 };

  it('salta para um segmento anterior e empilha o restante no avançar', () => {
    const backStack = [
      { mapId: ROOT_MAP_ID, view, label: 'Brasil' },
      { mapId: 'ne', view, label: 'Nordeste' },
    ];
    const result = computeBreadcrumbNavigation(
      0,
      backStack,
      [],
      'fortaleza',
      'Fortaleza',
      { x: 5, y: 5, scale: 2 }
    );
    expect(result).toEqual({
      backStack: [],
      forwardStack: [
        { mapId: 'fortaleza', view: { x: 5, y: 5, scale: 2 }, label: 'Fortaleza' },
        { mapId: 'ne', view, label: 'Nordeste' },
      ],
      currentMapId: ROOT_MAP_ID,
      currentLabel: 'Brasil',
      restoredView: view,
    });
  });

  it('ignora clique no segmento atual', () => {
    const backStack = [{ mapId: ROOT_MAP_ID, view, label: 'Início' }];
    expect(
      computeBreadcrumbNavigation(1, backStack, [], 'ne', 'Nordeste', view)
    ).toBeNull();
  });
});

describe('applyTopologyMapToPanelOptions', () => {
  it('grava no mapa raiz quando mapId é ROOT_MAP_ID', () => {
    const options = defaultOptions();
    const next = emptyMap();
    next.nodes.push({ id: 'host-1', x: 10, y: 20, type: 'host' });
    const updated = applyTopologyMapToPanelOptions(options, ROOT_MAP_ID, next);
    expect(updated.map).toBe(next);
    expect(updated.childMaps).toEqual(options.childMaps);
  });

  it('grava em childMaps quando mapId é de mapa interno', () => {
    const options = defaultOptions();
    const child = emptyMap();
    child.nodes.push({ id: 'swv-1', x: 30, y: 40, type: 'host', label: 'SWV01' });
    const updated = applyTopologyMapToPanelOptions(options, 'swv', child);
    expect(updated.map).toBe(options.map);
    expect(updated.childMaps?.swv).toBe(child);
  });
});
