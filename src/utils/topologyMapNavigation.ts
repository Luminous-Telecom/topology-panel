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

export interface NavigateBreadcrumbResult {
  backStack: TopologyNavFrame[];
  forwardStack: TopologyNavFrame[];
  currentMapId: string;
  currentLabel: string;
  restoredView: TopologyView;
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

/** Monta o caminho de breadcrumb a partir da pilha e do mapa atual. */
export function buildTopologyBreadcrumb(
  backStack: TopologyNavFrame[],
  currentMapId: string,
  currentLabel: string
): TopologyBreadcrumbItem[] {
  const trail: TopologyBreadcrumbItem[] = backStack.map((frame) => ({
    mapId: frame.mapId,
    label: frame.label.trim() || 'Início',
  }));
  const current = currentLabel.trim();
  if (current || trail.length > 0) {
    trail.push({
      mapId: currentMapId,
      label: current || 'Início',
    });
  }
  return trail;
}

/** Salta para um segmento do breadcrumb (índice anterior ao mapa atual). */
export function computeBreadcrumbNavigation(
  index: number,
  backStack: TopologyNavFrame[],
  forwardStack: TopologyNavFrame[],
  currentMapId: string,
  currentLabel: string,
  currentView: TopologyView
): NavigateBreadcrumbResult | null {
  const trail = buildTopologyBreadcrumb(backStack, currentMapId, currentLabel);
  if (index < 0 || index >= trail.length - 1) {
    return null;
  }
  const target = backStack[index];
  if (!target) {
    return null;
  }
  const discardedFromBack = backStack.slice(index + 1).reverse();
  return {
    backStack: backStack.slice(0, index),
    forwardStack: [
      { mapId: currentMapId, view: currentView, label: currentLabel || 'Início' },
      ...discardedFromBack,
      ...forwardStack,
    ],
    currentMapId: target.mapId,
    currentLabel: target.label,
    restoredView: target.view,
  };
}
