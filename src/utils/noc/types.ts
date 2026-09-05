import { TopologyHostIcon } from '../../types';

/** Filtros de status do mapa (modo NOC). */
export type TopologyMapStatusFilterId = 'offline' | 'online' | 'alert' | 'nodata';

/** Filtros de cabo (modo NOC). */
export type TopologyMapLinkFilterId =
  | 'congestedLinks'
  | 'link1g'
  | 'link10g'
  | 'link40g'
  | 'link100g';

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

/** Filtro de submapa no modo NOC (`submap:<mapId>`). */
export type TopologyMapSubmapFilterId = `submap:${string}`;

/** Filtros rápidos do mapa (modo NOC). */
export type TopologyMapFilterId =
  | TopologyMapStatusFilterId
  | TopologyMapTypeFilterId
  | TopologyMapLinkFilterId
  | TopologyMapSubmapFilterId;

export const NOC_SUBMAP_FILTER_PREFIX = 'submap:';

export function nocSubmapFilterId(mapId: string): TopologyMapSubmapFilterId {
  return `${NOC_SUBMAP_FILTER_PREFIX}${mapId}`;
}

export function isNocSubmapFilterId(filter: string): filter is TopologyMapSubmapFilterId {
  return filter.startsWith(NOC_SUBMAP_FILTER_PREFIX);
}

export function mapIdFromNocSubmapFilter(filter: string): string | undefined {
  return isNocSubmapFilterId(filter) ? filter.slice(NOC_SUBMAP_FILTER_PREFIX.length) : undefined;
}

/** Opções do menu Status no modo NOC. */
export const NOC_STATUS_MENU_IDS: readonly TopologyMapStatusFilterId[] = [
  'offline',
  'online',
  'alert',
  'nodata',
];

export const NOC_LINK_MENU_IDS: readonly TopologyMapLinkFilterId[] = [
  'congestedLinks',
  'link1g',
  'link10g',
  'link40g',
  'link100g',
];

export const TOPOLOGY_STATUS_FILTER_IDS: readonly TopologyMapFilterId[] = [
  ...NOC_STATUS_MENU_IDS,
  ...NOC_LINK_MENU_IDS,
];

const LINK_FILTER_IDS = new Set<string>(NOC_LINK_MENU_IDS);

export function isNocLinkFilterId(filter: TopologyMapFilterId): filter is TopologyMapLinkFilterId {
  return LINK_FILTER_IDS.has(filter);
}

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

export function nocFilterLabel(
  filter: TopologyMapFilterId,
  extra?: Readonly<Record<string, string>>
): string {
  const custom = extra?.[filter];
  if (custom) {
    return custom;
  }
  if (isNocSubmapFilterId(filter)) {
    return mapIdFromNocSubmapFilter(filter) ?? filter;
  }
  return TOPOLOGY_FILTER_LABELS[filter];
}

export const TOPOLOGY_FILTER_LABELS: Record<
  Exclude<TopologyMapFilterId, TopologyMapSubmapFilterId>,
  string
> = {
  offline: 'Offline',
  online: 'Online',
  alert: 'Alerta',
  nodata: 'Sem dados',
  congestedLinks: 'Congestionados',
  link1g: '1 Gb',
  link10g: '10 Gb',
  link40g: '40 Gb',
  link100g: '100 Gb',
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
