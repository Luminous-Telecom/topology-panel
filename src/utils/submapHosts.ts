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

/** Hosts type=host do mapa (mesma regra do build_dashboard.py / map_stats_hosts). */
export function extractTopologyHostNames(map: TopologyMap): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));

  for (const node of map.nodes ?? []) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const name = node.zabbixHost?.trim();
    if (!name || hidden.has(name)) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hosts.push(name);
  }

  return hosts;
}

/** Extrai mapa da topologia de um dashboard (API v1 panels ou v2 elements/vizConfig). */
function extractMapFromDashboardResponse(response: DashboardTopologyResponse): TopologyMap | undefined {
  for (const panel of response?.dashboard?.panels ?? []) {
    if (panel.type === 'luminous-dude-topology-panel' && panel.options?.map) {
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

/** Carrega hosts da topologia do dashboard linkado (submapUid). */
export async function fetchDashboardTopologyHosts(dashboardUid: string): Promise<string[]> {
  const uid = dashboardUid.trim();
  if (!uid) {
    return [];
  }

  const response = await getBackendSrv().get<DashboardTopologyResponse>(
    `/api/dashboards/uid/${encodeURIComponent(uid)}`
  );

  const map = extractMapFromDashboardResponse(response);
  return map ? extractTopologyHostNames(map) : [];
}
