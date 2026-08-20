import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { emptyMap } from './testMapFixtures';
import {
  ROOT_MAP_ID,
  applyTopologyMapToPanelOptions,
  buildTopologyBreadcrumb,
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
  it('retorna vazio no mapa raiz', () => {
    expect(buildTopologyBreadcrumb(ROOT_MAP_ID, '')).toEqual([]);
  });

  it('mostra Início e o mapa atual dentro de um submapa', () => {
    expect(buildTopologyBreadcrumb('fortaleza', 'Fortaleza')).toEqual([
      { mapId: ROOT_MAP_ID, label: 'Início' },
      { mapId: 'fortaleza', label: 'Fortaleza' },
    ]);
  });

  it('usa o id do mapa quando o submapa não tem rótulo', () => {
    expect(buildTopologyBreadcrumb('ne', '  ')[1]).toEqual({ mapId: 'ne', label: 'ne' });
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
    child.nodes.push({ id: 'host-1', x: 30, y: 40, type: 'host', label: 'Host filho' });
    const updated = applyTopologyMapToPanelOptions(options, 'child-a', child);
    expect(updated.map).toBe(options.map);
    expect(updated.childMaps?.['child-a']).toBe(child);
  });
});
