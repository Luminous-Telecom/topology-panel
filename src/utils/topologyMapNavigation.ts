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

/** Monta o caminho de breadcrumb a partir da pilha e do rótulo atual. */
export function buildTopologyBreadcrumb(backStack: TopologyNavFrame[], currentLabel: string): string[] {
  const trail = backStack.map((frame) => frame.label.trim()).filter(Boolean);
  const current = currentLabel.trim();
  if (current) {
    trail.push(current);
  }
  return trail;
}
