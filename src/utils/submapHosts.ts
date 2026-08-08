import { getBackendSrv } from '@grafana/runtime';
import { TopologyMap } from '../types';

/** Hosts type=host do mapa (mesma regra do build_dashboard.py / map_stats_hosts). */
export function extractTopologyHostNames(map: TopologyMap): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));

  for (const node of map.nodes ?? []) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const name = node.zabbixHost?.trim() || node.label?.trim();
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

/** Carrega hosts da topologia do dashboard linkado (submapUid). */
export async function fetchDashboardTopologyHosts(dashboardUid: string): Promise<string[]> {
  const uid = dashboardUid.trim();
  if (!uid) {
    return [];
  }

  try {
    const response = await getBackendSrv().get<{ dashboard?: { panels?: Array<{ type?: string; options?: { map?: TopologyMap } }> } }>(
      `/api/dashboards/uid/${encodeURIComponent(uid)}`
    );
    for (const panel of response?.dashboard?.panels ?? []) {
      if (panel.type === 'luminous-dude-topology-panel' && panel.options?.map?.nodes?.length) {
        return extractTopologyHostNames(panel.options.map);
      }
    }
  } catch {
    // fallback: statsHosts embutido no nó submapa
  }

  return [];
}
