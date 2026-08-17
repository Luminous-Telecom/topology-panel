import { TopologyMap, TopologyPanelOptions } from '../types';
import { isValidChildMapId } from './topologyMapNavigation';

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
  if (childMaps?.[trimmed]) {
    return childMaps;
  }
  return {
    ...(childMaps ?? {}),
    [trimmed]: emptyChildTopologyMap(),
  };
}
