import { TopologyMap, TopologyPanelOptions, TopologyView } from '../types';

/** Id do mapa raiz — corresponde a `options.map`. */
export const ROOT_MAP_ID = 'root';

/** Aplica alterações do mapa ativo (raiz ou filho) nas opções do painel. */
export function applyTopologyMapToPanelOptions(
  options: TopologyPanelOptions,
  mapId: string,
  map: TopologyMap
): TopologyPanelOptions {
  if (mapId === ROOT_MAP_ID) {
    return { ...options, map };
  }
  return {
    ...options,
    childMaps: {
      ...(options.childMaps ?? {}),
      [mapId]: map,
    },
  };
}

export const CHILD_MAP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface TopologyNavFrame {
  mapId: string;
  view: TopologyView;
  label: string;
}

export interface TopologyBreadcrumbItem {
  mapId: string;
  label: string;
}


export function isValidChildMapId(id: string): boolean {
  const trimmed = id.trim();
  return trimmed.length > 0 && CHILD_MAP_ID_PATTERN.test(trimmed);
}

/** Resolve o mapa ativo a partir do id de navegação. */
export function resolveTopologyMapById(
  options: Pick<TopologyPanelOptions, 'map' | 'childMaps'>,
  mapId: string
): TopologyMap | null {
  if (mapId === ROOT_MAP_ID) {
    return options.map ?? null;
  }
  const child = options.childMaps?.[mapId];
  return child ?? null;
}

/** View salva do mapa (raiz ou filho). */
export function resolveTopologyMapView(
  options: Pick<TopologyPanelOptions, 'view' | 'childMapViews'>,
  mapId: string,
  sessionViews: Record<string, TopologyView>
): TopologyView | undefined {
  if (mapId === ROOT_MAP_ID) {
    return options.view;
  }
  return sessionViews[mapId] ?? options.childMapViews?.[mapId];
}

/**
 * Trilha do breadcrumb — plana de propósito.
 *
 * No mapa raiz retorna `[]` (nada a mostrar). Dentro de um submapa retorna `[Início, submapa]`,
 * independente de quantos mapas foram visitados antes. O histórico completo fica nos botões
 * voltar/avançar.
 */
export function buildTopologyBreadcrumb(
  currentMapId: string,
  currentLabel: string
): TopologyBreadcrumbItem[] {
  if (currentMapId === ROOT_MAP_ID) {
    return [];
  }
  return [
    { mapId: ROOT_MAP_ID, label: 'Início' },
    { mapId: currentMapId, label: currentLabel.trim() || currentMapId },
  ];
}
