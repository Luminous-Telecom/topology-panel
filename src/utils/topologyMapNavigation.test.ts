import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../types';
import { emptyMap } from './testMapFixtures';
import {
  ROOT_MAP_ID,
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
  it('monta o caminho com rótulos da pilha e o mapa atual', () => {
    const trail = buildTopologyBreadcrumb(
      [
        { mapId: ROOT_MAP_ID, view: { x: 0, y: 0, scale: 1 }, label: 'Brasil' },
        { mapId: 'ne', view: { x: 0, y: 0, scale: 1 }, label: 'Nordeste' },
      ],
      'Fortaleza'
    );
    expect(trail).toEqual(['Brasil', 'Nordeste', 'Fortaleza']);
  });
});
