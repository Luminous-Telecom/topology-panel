/** Node types: host = Zabbix; submap = dashboard; static = label; network = retângulo de agrupamento */
export type TopologyNodeType = 'host' | 'submap' | 'static' | 'network';

export type TopologyHostIcon =
  | 'router'
  | 'camera'
  | 'access_point'
  | 'bridge'
  | 'web'
  | 'proxmox'
  | 'vmware'
  | 'linux'
  | 'windows'
  | 'host';

export interface TopologyNode {
  /** Unique id used by links (e.g. "swv01-switch") */
  id: string;
  /** Display label (defaults to id) */
  label?: string;
  /** Optional second line (IP or description) */
  subtitle?: string;
  /**
   * Zabbix host name to match for status coloring.
   * Required for type=host when a Zabbix query is configured.
   */
  zabbixHost?: string;
  type?: TopologyNodeType;
  /** Ícone do host (seleção manual) */
  icon?: TopologyHostIcon;
  /** Dashboard UID for submap nodes (type=submap) */
  submapUid?: string;
  /** Optional dashboard slug override */
  submapSlug?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Cor de preenchimento (type=network) */
  fillColor?: string;
  /** Cor da borda (type=network) */
  borderColor?: string;
}

export type TopologyLinkMedium = 'fiber' | 'radio';

export interface TopologyLink {
  /** Source node id */
  from: string;
  /** Target node id */
  to: string;
  /** fiber = linha contínua; radio = linha tracejada */
  medium?: TopologyLinkMedium;
}

export interface TopologyMap {
  /** Canvas width in layout units */
  width: number;
  /** Canvas height in layout units */
  height: number;
  nodes: TopologyNode[];
  links: TopologyLink[];
  /** Hosts from Zabbix query hidden from the map */
  hiddenHosts?: string[];
  /** When true, canvas editing is disabled */
  locked?: boolean;
  /** When true (default), network boxes cannot be dragged */
  networksLocked?: boolean;
}

/** Host name -> display info from Zabbix */
export interface HostMetadata {
  name: string;
  ip?: string;
}

export type HostMetadataMap = Record<string, HostMetadata>;

export interface TopologyPanelOptions {
  map: TopologyMap;
  /** Colors */
  colorOnline: string;
  colorOffline: string;
  colorUnknown: string;
  colorSubmap: string;
  colorLink: string;
  colorLinkWidth: number;
  /** Retângulos de rede (agrupamento) */
  colorNetworkFill: string;
  colorNetworkBorder: string;
  colorNetworkLabel: string;
  /** Node appearance */
  nodeFontSize: number;
  showSubtitle: boolean;
  /** Zabbix: field name after transform (default host) */
  statusHostField: string;
  /** Zabbix: field with packet loss / error value */
  statusValueField: string;
  /** Values >= this threshold = offline */
  offlineThreshold: number;
  /** Enable pan with mouse drag */
  enablePan: boolean;
  /** Enable zoom with mouse wheel */
  enableZoom: boolean;
  /** Show grid in edit-friendly mode */
  showGrid: boolean;
  /** Grid cell size in layout units */
  gridSize: number;
  /** Snap nodes and networks to grid when moving or resizing */
  snapToGrid: boolean;
  /** Zabbix datasource UID (for buscar IP via API) */
  zabbixDatasourceUid?: string;
  /** Grupo Zabbix (ex.: Dude/Mapa/SWV) — mesmo da query */
  zabbixGroupFilter?: string;
  /** Coluna IP nos dados da query (se houver) */
  hostIpField: string;
}

export const defaultTopologyMap = (): TopologyMap => ({
  width: 1200,
  height: 800,
  nodes: [
    {
      id: 'core-switch',
      label: 'CORE-SWITCH',
      subtitle: '10.255.1.145',
      zabbixHost: 'SWV01-SWITCH-S6730H',
      type: 'host',
      x: 400,
      y: 300,
      width: 140,
      height: 44,
    },
    {
      id: 'city-plw',
      label: 'PORTALEGRE - RN',
      subtitle: 'Submapa',
      type: 'submap',
      submapUid: 'dude-plw',
      x: 700,
      y: 200,
      width: 160,
      height: 48,
    },
  ],
  links: [{ from: 'core-switch', to: 'city-plw' }],
});

export const defaultOptions = (): TopologyPanelOptions => ({
  map: defaultTopologyMap(),
  colorOnline: '#2E7D32',
  colorOffline: '#C62828',
  colorUnknown: '#616161',
  colorSubmap: '#1565C0',
  colorLink: '#78909C',
  colorLinkWidth: 2,
  colorNetworkFill: 'rgba(96, 96, 96, 0.22)',
  colorNetworkBorder: '#8a8a8a',
  colorNetworkLabel: '#bdbdbd',
  nodeFontSize: 11,
  showSubtitle: true,
  statusHostField: 'host',
  statusValueField: 'loss',
  offlineThreshold: 1,
  enablePan: true,
  enableZoom: true,
  showGrid: false,
  gridSize: 10,
  snapToGrid: true,
  zabbixDatasourceUid: 'afkagcaezrrpca',
  hostIpField: 'ip',
});

/** Host name -> last status value (packet loss %) */
export type HostStatusMap = Record<string, number | null | undefined>;

export function nodeDimensions(node: TopologyNode): { w: number; h: number } {
  return { w: node.width ?? 120, h: node.height ?? 40 };
}

export function nodeCenter(node: TopologyNode): { cx: number; cy: number } {
  const { w, h } = nodeDimensions(node);
  return { cx: node.x + w / 2, cy: node.y + h / 2 };
}

export function nodeById(map: TopologyMap): Map<string, TopologyNode> {
  return new Map(map.nodes.map((n) => [n.id, n]));
}

export function parseTopologyJson(raw: string): TopologyMap | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const links = Array.isArray(parsed.links) ? parsed.links : [];
    return {
      width: Number(parsed.width) || 1200,
      height: Number(parsed.height) || 800,
      nodes,
      links,
      locked: Boolean(parsed.locked),
      networksLocked: parsed.networksLocked !== false,
      hiddenHosts: Array.isArray(parsed.hiddenHosts) ? parsed.hiddenHosts : undefined,
    };
  } catch {
    return null;
  }
}

export function topologyToJson(map: TopologyMap): string {
  return JSON.stringify(map, null, 2);
}
