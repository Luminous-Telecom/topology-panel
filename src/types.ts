/** Node types: host = Zabbix; submap = dashboard; static = label; network = retângulo; dashboard_picker = seletor de dashboards */
export type TopologyNodeType = 'host' | 'submap' | 'static' | 'network' | 'dashboard_picker';

/** Entrada configurável no seletor de dashboards (type=dashboard_picker) */
export interface TopologyDashboardChoice {
  uid: string;
  slug?: string;
  title?: string;
}

export type TopologyHostIcon =
  | 'router'
  | 'bras'
  | 'switch_managed'
  | 'switch_unmanaged'
  | 'firewall'
  | 'vpn'
  | 'vpn_server'
  | 'olt'
  | 'access_point'
  | 'mesh'
  | 'camera'
  | 'dvr'
  | 'bridge'
  | 'power'
  | 'server'
  | 'network'
  /** Legado — mapas antigos; não aparece no picker */
  | 'load_balancer'
  | 'onu'
  | 'fiber'
  | 'radio'
  | 'tower'
  | 'satellite'
  | 'rack'
  | 'dns'
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
   * @deprecated Legado — não gravado; vínculo do host é pelo IP (`subtitle` / `zabbixHost`).
   */
  zabbixHostId?: string;
  /**
   * Chave do host no mapa — preferencialmente o IP da interface principal.
   * Nome visível do Zabbix fica em `label`.
   */
  zabbixHost?: string;
  type?: TopologyNodeType;
  /** Ícone do host (seleção manual) */
  icon?: TopologyHostIcon;
  /** Dashboard UID for submap nodes (type=submap) */
  submapUid?: string;
  /** Optional dashboard slug override */
  submapSlug?: string;
  /**
   * RefId da query Zabbix (aba Query) cujo host group alimenta o status deste submapa.
   * Ex.: query B com group PLW → queryRefId: "B". Hosts dessa query não aparecem no mapa pai.
   */
  queryRefId?: string;
  /**
   * Dashboards disponíveis no seletor (type=dashboard_picker).
   * Em visualização o clique abre a lista para escolher e navegar.
   */
  dashboardChoices?: TopologyDashboardChoice[];
  /**
   * Quando false: conta só hosts diretos do dashboard linkado (ignora submapas internos)
   * e este submapa não entra na contagem de mapas pai.
   * Padrão: true (inclui submapas internos no status).
   */
  includeInParentStats?: boolean;
  /** @deprecated Use includeInParentStats */
  showStatusStats?: boolean;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Cor de preenchimento (type=network | static) */
  fillColor?: string;
  /** Cor da borda (type=network) */
  borderColor?: string;
  /** Cor do texto (type=static) */
  labelColor?: string;
  /** Rede pai explícita (type=host) — alternativa à detecção por posição */
  networkId?: string;
  /** Tamanho da fonte (type=static) */
  fontSize?: number;
  /** Usuário para Tools (Winbox / SSH / Telnet) — sobrescreve o padrão do painel */
  toolUsername?: string;
  /** Senha para Tools — sobrescreve o padrão do painel (fica no JSON do mapa) */
  toolPassword?: string;
}

export type TopologyLinkMedium = 'fiber' | 'radio';

export interface TopologyLink {
  /** Source node id */
  from: string;
  /** Target node id */
  to: string;
  /** fiber = linha contínua; radio = linha tracejada */
  medium?: TopologyLinkMedium;
  /** Capacidade em Mbps (ex.: 100, 1000, 10000) — define rótulo e espessura */
  bandwidthMbps?: number;
  /** Pontos intermediários para desviar a linha (origem → … → destino) */
  waypoints?: Array<{ x: number; y: number }>;
}

export interface TopologyMap {
  /** Canvas width in layout units */
  width: number;
  /** Canvas height in layout units */
  height: number;
  nodes: TopologyNode[];
  links: TopologyLink[];
  /** Ícone por nome do host Zabbix (persiste mesmo sem layout salvo) */
  hostIcons?: Partial<Record<string, TopologyHostIcon>>;
  /** Hosts from Zabbix query hidden from the map */
  hiddenHosts?: string[];
  /** When true, canvas editing is disabled */
  locked?: boolean;
  /** When true (default), network boxes cannot be dragged */
  networksLocked?: boolean;
}

/** Host name ou hostid -> display info from Zabbix */
export interface HostMetadata {
  name: string;
  ip?: string;
  hostid?: string;
}

export type HostMetadataMap = Record<string, HostMetadata>;

/** Query Grafana (refId) detectada na aba Query do painel. */
export interface TopologyQueryRefInfo {
  refId: string;
  /** Resumo legível (ex.: host group Zabbix) */
  hint?: string;
}

export interface TopologyView {
  x: number;
  y: number;
  scale: number;
}

export type TopologyHostStatus = 'online' | 'offline';

/** Mapeamento de valor da Query → status online/offline (configurado no painel). */
export interface TopologyStatusValueMapping {
  /** Valor exato — se definido, ignora from/to */
  value?: number;
  /** Início do intervalo inclusivo (omitir = −∞) */
  from?: number;
  /** Fim do intervalo inclusivo (omitir = +∞) */
  to?: number;
  status: TopologyHostStatus;
  /** Rótulo opcional no hover/legenda */
  label?: string;
}

export interface TopologyPanelOptions {
  map: TopologyMap;
  /** Posição e zoom do canvas (persiste ao salvar o dashboard) */
  view?: TopologyView;
  /** Colors */
  /** Host online (mapeamento de valor) */
  colorOnline: string;
  /** Host offline (mapeamento de valor) */
  colorOffline: string;
  /** Host sem cor na Query */
  colorUnknown: string;
  /** Valor da Query → online/offline */
  statusValueMappings: TopologyStatusValueMapping[];
  /** Cor padrão dos rótulos estáticos */
  colorStatic: string;
  colorSubmap: string;
  colorLink: string;
  /** Animação download (sentido origem) */
  colorLinkDownload: string;
  /** Animação upload (sentido destino / seta) */
  colorLinkUpload: string;
  colorLinkWidth: number;
  /** Retângulos de rede (agrupamento) */
  colorNetworkFill: string;
  colorNetworkBorder: string;
  colorNetworkLabel: string;
  /** Node appearance */
  nodeFontSize: number;
  showSubtitle: boolean;
  /**
   * RefIds das queries que importam hosts ao mapa (opt-in).
   * Vazio = nenhuma query adiciona hosts automaticamente.
   */
  displayQueryRefIds?: string[];
  /** Sincronizado pelo painel a partir da aba Query (não editar manualmente). */
  queryRefIdsAvailable?: string[];
  /** Metadados das queries (refId + resumo) para o editor de opções. */
  queryRefInfosAvailable?: TopologyQueryRefInfo[];
  /** Enable pan with mouse drag */
  enablePan: boolean;
  /** Enable zoom with mouse wheel / pinch on touch */
  enableZoom: boolean;
  /** Show grid in edit-friendly mode */
  showGrid: boolean;
  /** Grid cell size in layout units */
  gridSize: number;
  /** Snap nodes and networks to grid when moving or resizing */
  snapToGrid: boolean;
  /** Usuário padrão para Winbox / SSH / Telnet (Tools) */
  toolUsername?: string;
  /** Senha padrão para Winbox / SSH / Telnet (fica no JSON do dashboard) */
  toolPassword?: string;
  /** Exibir legenda de cores no mapa */
  showLegend?: boolean;
  /** Mini mapa de visão geral (arrastar para navegar) */
  showMinimap?: boolean;
  /** Itens da legenda (quais cores mostrar) */
  legendUnknown?: boolean;
  legendOnline?: boolean;
  legendOffline?: boolean;
  legendStatic?: boolean;
  legendSubmap?: boolean;
  legendLink?: boolean;
  legendDownload?: boolean;
  legendUpload?: boolean;
  /**
   * Nome da variável Grafana na barra do painel de controle (ex.: mapa → $mapa / var-mapa).
   * Configure as opções em: Dashboard → Configurações → Variáveis.
   */
  dashboardNavVariable?: string;
  /**
   * Seletor extra no canto do mapa (opcional). Preferir a variável Grafana do dashboard.
   */
  showDashboardNav?: boolean;
  /** Rótulo do botão do seletor no mapa (só se showDashboardNav) */
  dashboardNavLabel?: string;
  /** Dashboards do botão no mapa (só se showDashboardNav) */
  dashboardNavChoices?: TopologyDashboardChoice[];
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
      submapUid: 'topo-plw',
      x: 700,
      y: 200,
      width: 160,
      height: 48,
    },
  ],
  links: [{ from: 'core-switch', to: 'city-plw' }],
});

export const defaultStatusValueMappings = (): TopologyStatusValueMapping[] => [
  { value: 0, status: 'offline', label: 'Down' },
  { from: 0, status: 'online', label: 'Up' },
];

export const defaultOptions = (): TopologyPanelOptions => ({
  map: defaultTopologyMap(),
  colorOnline: '#2E7D32',
  colorOffline: '#C62828',
  colorUnknown: '#616161',
  statusValueMappings: defaultStatusValueMappings(),
  colorStatic: '#616161',
  colorSubmap: '#1565C0',
  colorLink: '#78909C',
  colorLinkDownload: '#4FC3F7',
  colorLinkUpload: '#FFB74D',
  colorLinkWidth: 2,
  colorNetworkFill: 'rgba(96, 96, 96, 0.22)',
  colorNetworkBorder: '#8a8a8a',
  colorNetworkLabel: '#bdbdbd',
  nodeFontSize: 11,
  showSubtitle: true,
  enablePan: true,
  enableZoom: true,
  showGrid: false,
  gridSize: 10,
  snapToGrid: true,
  toolUsername: '',
  toolPassword: '',
  showLegend: true,
  showMinimap: true,
  legendUnknown: true,
  legendOnline: true,
  legendOffline: true,
  legendStatic: false,
  legendSubmap: false,
  legendLink: false,
  legendDownload: false,
  legendUpload: false,
  dashboardNavVariable: 'mapa',
  showDashboardNav: false,
  dashboardNavLabel: 'Dashboards',
  dashboardNavChoices: [],
});

/** Cor/texto do status mapeado por host (valor da Query + mapeamento do painel). */
export interface HostDisplayInfo {
  value: number;
  color?: string;
  text?: string;
  status?: TopologyHostStatus;
}

export type HostDisplayMap = Record<string, HostDisplayInfo>;

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
      hostIcons:
        parsed.hostIcons && typeof parsed.hostIcons === 'object' && !Array.isArray(parsed.hostIcons)
          ? (parsed.hostIcons as TopologyMap['hostIcons'])
          : undefined,
    };
  } catch {
    return null;
  }
}

export function topologyToJson(map: TopologyMap): string {
  return JSON.stringify(map, null, 2);
}
