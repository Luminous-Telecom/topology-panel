import { TopologyHostIcon } from '../../types';

/** Filtros de status do mapa (modo NOC). */
export type TopologyMapStatusFilterId = 'offline' | 'problems' | 'congestedLinks';

/** Filtros por tipo de equipamento (ícone / template). */
export type TopologyMapTypeFilterId =
  | 'olt'
  | 'router'
  | 'switch'
  | 'firewall'
  | 'vpn'
  | 'access_point'
  | 'camera'
  | 'dvr'
  | 'bridge'
  | 'power'
  | 'server'
  | 'cloud';

/** Filtros rápidos do mapa (modo NOC). */
export type TopologyMapFilterId = TopologyMapStatusFilterId | TopologyMapTypeFilterId;

export const TOPOLOGY_STATUS_FILTER_IDS: readonly TopologyMapStatusFilterId[] = [
  'offline',
  'problems',
  'congestedLinks',
];

export interface TopologyHostTypeFilter {
  id: TopologyMapTypeFilterId;
  tag: string;
  icons: readonly TopologyHostIcon[];
  templateIds?: readonly string[];
}

/** Tipos do picker, na ordem dos chips do modo NOC. */
export const TOPOLOGY_HOST_TYPE_FILTERS: readonly TopologyHostTypeFilter[] = [
  { id: 'olt', tag: 'OLT', icons: ['olt'], templateIds: ['olt'] },
  { id: 'router', tag: 'Roteador', icons: ['router'], templateIds: ['router', 'core-router'] },
  {
    id: 'switch',
    tag: 'Switch',
    icons: ['switch_managed', 'switch_unmanaged', 'bras'],
    templateIds: ['switch'],
  },
  { id: 'firewall', tag: 'Firewall', icons: ['firewall'] },
  { id: 'vpn', tag: 'VPN', icons: ['vpn_server', 'vpn'] },
  { id: 'access_point', tag: 'Access Point', icons: ['access_point'] },
  { id: 'camera', tag: 'Câmera', icons: ['camera'] },
  { id: 'dvr', tag: 'DVR', icons: ['dvr'] },
  { id: 'bridge', tag: 'Ponto a ponto', icons: ['bridge'] },
  { id: 'power', tag: 'Energia', icons: ['power'] },
  { id: 'server', tag: 'Servidor', icons: ['server'], templateIds: ['server'] },
  { id: 'cloud', tag: 'Nuvem', icons: ['cloud', 'network'] },
];

const HOST_TYPE_FILTER_IDS = new Set<string>(TOPOLOGY_HOST_TYPE_FILTERS.map((def) => def.id));

export const TOPOLOGY_HOST_TYPE_FILTER_BY_ID: ReadonlyMap<string, TopologyHostTypeFilter> = new Map(
  TOPOLOGY_HOST_TYPE_FILTERS.map((def) => [def.id, def])
);

export function isHostTypeFilterId(filter: TopologyMapFilterId): filter is TopologyMapTypeFilterId {
  return HOST_TYPE_FILTER_IDS.has(filter);
}

export const TOPOLOGY_FILTER_LABELS: Record<TopologyMapFilterId, string> = {
  offline: 'Somente DOWN',
  problems: 'Com problemas',
  congestedLinks: 'Links congestionados',
  olt: 'OLTs',
  router: 'Roteadores',
  switch: 'Switches',
  firewall: 'Firewalls',
  vpn: 'VPN',
  access_point: 'Access Points',
  camera: 'Câmeras',
  dvr: 'DVRs',
  bridge: 'Ponto a ponto',
  power: 'Energia',
  server: 'Servidores',
  cloud: 'Nuvem',
};

/** Resumo de problemas Zabbix por host (runtime — não persiste no mapa). */
export interface HostProblemSummary {
  count: number;
  maxSeverity: number;
  /** Nomes dos problemas ativos (Warning+), o mais grave primeiro. */
  names?: string[];
}

export type HostProblemsMap = Record<string, HostProblemSummary>;

/** Severidade Zabbix mínima (Warning = 2) para badges e filtro NOC — abaixo disso não conta na UI. */
export const ZABBIX_PROBLEM_MIN_SEVERITY = 2;

/** Badge opcional no canto do nó. */
export interface HostNodeBadge {
  kind: 'problems' | 'alert';
  label: string;
  color: string;
}
