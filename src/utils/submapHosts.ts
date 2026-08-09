import { getBackendSrv } from '@grafana/runtime';
import { TopologyMap } from '../types';

type DashboardTopologyPanel = { type?: string; options?: { map?: TopologyMap } };
type DashboardTopologyElement = {
  spec?: {
    vizConfig?: {
      spec?: {
        options?: {
          map?: TopologyMap;
        };
      };
    };
  };
};
type DashboardTopologyResponse = {
  dashboard?: {
    panels?: DashboardTopologyPanel[];
    elements?: Record<string, DashboardTopologyElement>;
  };
};

const MAX_SUBMAP_DEPTH = 8;

/** Submapa entra na contagem do mapa pai? (padrão: sim) */
export function isIncludedInParentStats(node: { includeInParentStats?: boolean; showStatusStats?: boolean }): boolean {
  if (node.includeInParentStats === false) {
    return false;
  }
  // Legado: showStatusStats=false significava excluir do pai
  if (node.includeInParentStats === undefined && node.showStatusStats === false) {
    return false;
  }
  return true;
}

/** Hosts type=host do mapa — prefer hostid (estável), senão nome. */
export function extractTopologyHostNames(map: TopologyMap): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));

  for (const node of map.nodes ?? []) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const name = node.zabbixHost?.trim();
    const hostId = node.zabbixHostId?.trim();
    if (name && hidden.has(name)) {
      continue;
    }
    // Chave estável para stats/ICMP; nome só como fallback (mapas legados)
    const key = hostId || name;
    if (!key) {
      continue;
    }
    const dedupe = key.toLowerCase();
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);
    hosts.push(key);
  }

  return hosts;
}

/** Extrai hostids e nomes separados (para API Zabbix). */
export function extractTopologyHostRefs(map: TopologyMap): { hostIds: string[]; hostNames: string[] } {
  const hostIds: string[] = [];
  const hostNames: string[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));

  for (const node of map.nodes ?? []) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const name = node.zabbixHost?.trim();
    const hostId = node.zabbixHostId?.trim();
    if (name && hidden.has(name)) {
      continue;
    }
    if (hostId && !seenIds.has(hostId)) {
      seenIds.add(hostId);
      hostIds.push(hostId);
    }
    if (name && !seenNames.has(name.toLowerCase())) {
      seenNames.add(name.toLowerCase());
      hostNames.push(name);
    }
  }

  return { hostIds, hostNames };
}

/**
 * UIDs de dashboards linkados por nós submapa neste mapa.
 * Ignora submapas com includeInParentStats=false (não contaminam o status do pai).
 */
export function extractNestedSubmapUids(map: TopologyMap): string[] {
  const seen = new Set<string>();
  const uids: string[] = [];

  for (const node of map.nodes ?? []) {
    if (node.type !== 'submap') {
      continue;
    }
    if (!isIncludedInParentStats(node)) {
      continue;
    }
    const uid = node.submapUid?.trim();
    if (!uid || seen.has(uid)) {
      continue;
    }
    seen.add(uid);
    uids.push(uid);
  }

  return uids;
}

function mergeHostNames(lists: string[][]): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  for (const list of lists) {
    for (const raw of list) {
      const name = raw.trim();
      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hosts.push(name);
    }
  }

  return hosts;
}

/** Extrai mapa da topologia de um dashboard (API v1 panels ou v2 elements/vizConfig). */
function extractMapFromDashboardResponse(response: DashboardTopologyResponse): TopologyMap | undefined {
  const topologyPanelTypes = new Set(['luminous-topology-panel', 'luminous-dude-topology-panel']);
  for (const panel of response?.dashboard?.panels ?? []) {
    if (panel.type && topologyPanelTypes.has(panel.type) && panel.options?.map) {
      return panel.options.map;
    }
  }

  for (const element of Object.values(response?.dashboard?.elements ?? {})) {
    const map = element?.spec?.vizConfig?.spec?.options?.map;
    if (map) {
      return map;
    }
  }

  return undefined;
}

async function fetchDashboardMap(dashboardUid: string): Promise<TopologyMap | undefined> {
  const response = await getBackendSrv().get<DashboardTopologyResponse>(
    `/api/dashboards/uid/${encodeURIComponent(dashboardUid)}`
  );
  return extractMapFromDashboardResponse(response);
}

/**
 * Carrega hosts da topologia do dashboard linkado (submapUid).
 * Com includeNested=true (padrão), desce em submapas internos (respeitando includeInParentStats).
 * Com includeNested=false, só hosts diretos do mapa.
 */
export async function fetchDashboardTopologyHosts(
  dashboardUid: string,
  options?: {
    ancestors?: Set<string>;
    cache?: Map<string, Promise<string[]>>;
    depth?: number;
    /** false = só hosts do mapa, sem descer em submapas internos */
    includeNested?: boolean;
  }
): Promise<string[]> {
  const uid = dashboardUid.trim();
  if (!uid) {
    return [];
  }

  const includeNested = options?.includeNested !== false;
  const ancestors = options?.ancestors ?? new Set<string>();
  if (ancestors.has(uid)) {
    return [];
  }

  const depth = options?.depth ?? 0;
  if (depth > MAX_SUBMAP_DEPTH) {
    return [];
  }

  const cache = options?.cache ?? new Map<string, Promise<string[]>>();
  const cacheKey = includeNested ? uid : `${uid}::direct`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(uid);

  const promise = (async () => {
    const map = await fetchDashboardMap(uid);
    if (!map) {
      return [];
    }

    const direct = extractTopologyHostNames(map);
    if (!includeNested) {
      return direct;
    }

    const nestedUids = extractNestedSubmapUids(map);
    if (!nestedUids.length) {
      return direct;
    }

    const nestedLists = await Promise.all(
      nestedUids.map(async (nestedUid) => {
        try {
          return await fetchDashboardTopologyHosts(nestedUid, {
            ancestors: nextAncestors,
            cache,
            depth: depth + 1,
            includeNested: true,
          });
        } catch {
          return [];
        }
      })
    );

    return mergeHostNames([direct, ...nestedLists]);
  })();

  cache.set(cacheKey, promise);
  return promise;
}
