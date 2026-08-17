import { TopologyMap, TopologyPanelOptions } from '../types';
import { isValidChildMapId } from './topologyMapNavigation';

/** Mapas internos ativos — ignora chaves marcadas com `undefined` após remoção no editor. */
export function activeChildMaps(
  childMaps: TopologyPanelOptions['childMaps']
): Record<string, TopologyMap> {
  if (!childMaps) {
    return {};
  }
  const out: Record<string, TopologyMap> = {};
  for (const [id, map] of Object.entries(childMaps)) {
    if (map != null) {
      out[id] = map;
    }
  }
  return out;
}

export function emptyChildTopologyMap(): TopologyMap {
  return {
    width: 1200,
    height: 800,
    nodes: [],
    links: [],
    networksLocked: true,
  };
}

/** Cria entrada em `childMaps` se o id for válido e ainda não existir. */
export function ensureChildMapEntry(
  childMaps: TopologyPanelOptions['childMaps'],
  mapId: string
): TopologyPanelOptions['childMaps'] | undefined {
  const trimmed = mapId.trim();
  if (!isValidChildMapId(trimmed)) {
    return childMaps;
  }
  if (activeChildMaps(childMaps)[trimmed]) {
    return childMaps;
  }
  return {
    ...(childMaps ?? {}),
    [trimmed]: emptyChildTopologyMap(),
  };
}

/**
 * Remove mapa interno do painel.
 * O Grafana faz merge nas opções — deletar a chave não basta; é preciso enviar `undefined`.
 */
export function removeChildMapEntry(
  childMaps: TopologyPanelOptions['childMaps'],
  mapId: string
): TopologyPanelOptions['childMaps'] {
  return {
    ...(childMaps ?? {}),
    [mapId]: undefined,
  };
}
