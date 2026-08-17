/** Migrações do JSON do mapa — preserva compatibilidade com dashboards existentes. */
import { TopologyMap } from '../types';

/** Versão atual do schema persistido em `TopologyMap.schemaVersion`. */
export const CURRENT_MAP_SCHEMA_VERSION = 2;

function migrateV1ToV2(map: TopologyMap): TopologyMap {
  return {
    ...map,
    schemaVersion: 2,
    links: Array.isArray(map.links) ? map.links.map((link) => ({ ...link })) : [],
    nodes: Array.isArray(map.nodes) ? map.nodes : [],
  };
}

/**
 * Aplica migrações incrementais até `CURRENT_MAP_SCHEMA_VERSION`.
 * Mapas sem `schemaVersion` são tratados como v1 (links só com from/to).
 */
export function migrateTopologyMap(map: TopologyMap): TopologyMap {
  let current = { ...map };
  let version = current.schemaVersion ?? 1;

  if (version < 2) {
    current = migrateV1ToV2(current);
    version = 2;
  }

  if (version !== CURRENT_MAP_SCHEMA_VERSION) {
    return { ...current, schemaVersion: CURRENT_MAP_SCHEMA_VERSION };
  }

  return current;
}
