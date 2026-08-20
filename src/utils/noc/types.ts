/** Filtros rápidos do mapa (modo NOC). */
export type TopologyMapFilterId =
  | 'offline'
  | 'problems'
  | 'congestedLinks'
  | 'olt'
  | 'router'
  | 'switch';

export const TOPOLOGY_FILTER_LABELS: Record<TopologyMapFilterId, string> = {
  offline: 'Somente DOWN',
  problems: 'Com problemas',
  congestedLinks: 'Links congestionados',
  olt: 'OLTs',
  router: 'Roteadores',
  switch: 'Switches',
};

/** Resumo de problemas Zabbix por host (runtime — não persiste no mapa). */
export interface HostProblemSummary {
  count: number;
  maxSeverity: number;
}

export type HostProblemsMap = Record<string, HostProblemSummary>;

/** Severidade Zabbix mínima (Warning = 2) para badges e filtro NOC — abaixo disso não conta na UI. */
export const ZABBIX_PROBLEM_MIN_SEVERITY = 2;

/** Badge opcional no canto do nó. */
export interface HostNodeBadge {
  kind: 'problems' | 'traffic' | 'alert';
  label: string;
  color: string;
}
