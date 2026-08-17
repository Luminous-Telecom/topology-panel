/** Node types: host = Zabbix; submap = dashboard; static = label; network = retângulo; dashboard_picker = seletor de dashboards */
import type {
  TopologyBlueprint,
  TopologyNodeTemplate,
  TopologyTemplateRule,
} from './utils/topologyTemplates/types';

export type {
  NodeTemplateFieldKind,
  TopologyBlueprint,
  TopologyBlueprintLink,
  TopologyBlueprintRole,
  TopologyNodeTemplate,
  TemplateRuleCondition,
  TopologyTemplateRule,
} from './utils/topologyTemplates/types';

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
   * Id do mapa interno (chave em `TopologyPanelOptions.childMaps`).
   * Quando definido, o clique navega dentro do painel em vez de abrir outro dashboard.
   */
  submapChildMapId?: string;
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
  x: number;
  y: number;
  /** `manual` (padrão) preserva posição no auto-layout; `auto` segue reorganização. */
  positionMode?: 'manual' | 'auto';
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
  /** Template visual aplicado (manual ou por regra). */
  nodeTemplateId?: string;
  /** Quando true, regras automáticas não alteram template/ícone. */
  templateLocked?: boolean;
}

export type TopologyLinkMedium = 'fiber' | 'radio';

/** Confiança do auto-binding de item Zabbix → interface. */
export type MetricBindingConfidence = 'high' | 'medium' | 'low' | 'ambiguous';

/** Referência persistida a um item Zabbix. */
export interface TopologyMetricReference {
  itemId: string;
  key?: string;
  confidence?: MetricBindingConfidence;
}

/** Itens Zabbix vinculados a uma interface de rede. */
export interface TopologyInterfaceMetrics {
  rx?: TopologyMetricReference;
  tx?: TopologyMetricReference;
  operStatus?: TopologyMetricReference;
  adminStatus?: TopologyMetricReference;
  speed?: TopologyMetricReference;
  errors?: TopologyMetricReference;
  drops?: TopologyMetricReference;
}

/** Interface persistida em um endpoint de link. */
export interface TopologyInterfaceReference {
  /** Nome da interface (ifName / macro LLD) */
  name: string;
  snmpIndex?: string;
  alias?: string;
  metrics?: TopologyInterfaceMetrics;
}

export type TopologyLinkWidthMode = 'fixed' | 'capacity' | 'traffic' | 'utilization';
export type TopologyLinkFlowMode = 'none' | 'rx' | 'tx' | 'bidirectional';
export type TopologyLinkDiscoverySource = 'manual' | 'lldp' | 'cdp' | 'zabbix';
export type TopologyLinkDiscoveryState = 'suggested' | 'confirmed' | 'ignored';

export interface TopologyLinkStyle {
  widthMode?: TopologyLinkWidthMode;
  flowMode?: TopologyLinkFlowMode;
}

export interface TopologyLinkDiscovery {
  source?: TopologyLinkDiscoverySource;
  state?: TopologyLinkDiscoveryState;
  confirmed?: boolean;
}

export interface TopologyLink {
  /** Source node id */
  from: string;
  /** Target node id */
  to: string;
  /** Interface no host de origem */
  fromInterface?: TopologyInterfaceReference;
  /** Interface no host de destino */
  toInterface?: TopologyInterfaceReference;
  /** fiber = linha contínua; radio = linha tracejada */
  medium?: TopologyLinkMedium;
  /** Capacidade em Mbps (ex.: 100, 1000, 10000) — define rótulo e espessura */
  bandwidthMbps?: number;
  /** Pontos intermediários para desviar a linha (origem → … → destino) */
  waypoints?: Array<{ x: number; y: number }>;
  style?: TopologyLinkStyle;
  discovery?: TopologyLinkDiscovery;
}

/** Interface de rede descoberta via Zabbix (runtime — não persistida no mapa). */
export interface TopologyNetworkInterface {
  hostKey: string;
  hostid?: string;
  name: string;
  alias?: string;
  description?: string;
  snmpIndex?: string;
  mac?: string;
  ip?: string;
  speedMbps?: number;
  adminStatus?: number;
  operStatus?: number;
  metrics: TopologyInterfaceMetrics;
  bindingConfidence: MetricBindingConfidence;
}

/** Métricas voláteis de um endpoint de link (runtime). */
export interface LinkEndpointRuntimeMetrics {
  rxBps?: number;
  txBps?: number;
  rxUtilizationPct?: number;
  txUtilizationPct?: number;
  operStatus?: 'up' | 'down' | 'adminDown' | 'unknown';
  capacityMbps?: number;
  errors?: number;
  drops?: number;
  lastUpdateMs?: number;
}

export type LinkRuntimeStatus = 'up' | 'down' | 'degraded' | 'highUtilization' | 'noData';

/** Métricas voláteis de um link (runtime — não persistidas). */
export interface LinkRuntimeMetrics {
  from: LinkEndpointRuntimeMetrics;
  to: LinkEndpointRuntimeMetrics;
  status: LinkRuntimeStatus;
}

export type LinkRuntimeMetricsMap = Record<string, LinkRuntimeMetrics>;

/** Link sugerido por descoberta LLDP/CDP — aguarda revisão do usuário. */
export interface TopologySuggestedLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromInterface?: TopologyInterfaceReference;
  toInterface?: TopologyInterfaceReference;
  source: 'lldp' | 'cdp';
  state: 'suggested' | 'ignored';
  confidence: MetricBindingConfidence;
  localPort?: string;
  remotePort?: string;
  remoteSysName?: string;
}

export interface TopologyMap {
  /**
   * Versão do schema JSON do mapa.
   * Ausente = v1 (links só com from/to). Ver `utils/mapMigration.ts`.
   */
  schemaVersion?: number;
  /** Canvas width in layout units */
  width: number;
  /** Canvas height in layout units */
  height: number;
  nodes: TopologyNode[];
  links: TopologyLink[];
  /** Links sugeridos por LLDP/CDP — não entram no mapa até confirmação */
  suggestedLinks?: TopologySuggestedLink[];
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
  /** Grupos do host no Zabbix (para regras de template). */
  hostGroups?: string[];
  /** Tags do host no Zabbix. */
  tags?: Array<{ tag: string; value: string }>;
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

/** Ferramenta ativa na toolbar do canvas: seta (seleção) ou mão (arrastar o mapa). */
export type CanvasTool = 'select' | 'pan';

export type TopologyHostStatus = 'online' | 'offline' | 'alert';

/** Mapeamento de valor da Query → status (configurado no painel). */
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
  /** Mapas filhos indexados por id estável (ex.: "map-fortaleza"). Valor `undefined` = removido (merge do Grafana). */
  childMaps?: Record<string, TopologyMap | undefined>;
  /** Posição e zoom por mapa filho (persiste ao salvar o dashboard) */
  childMapViews?: Record<string, TopologyView>;
  /** Id do mapa raiz; implícito = "root" usando `map` */
  rootMapId?: string;
  /** Colors */
  /** Host online (mapeamento de valor) */
  colorOnline: string;
  /** Host offline (mapeamento de valor) */
  colorOffline: string;
  /** Host em alerta (mapeamento de valor) */
  colorAlert: string;
  /** Host sem cor na Query */
  colorUnknown: string;
  /** Valor da Query → status */
  statusValueMappings: TopologyStatusValueMapping[];
  /**
   * Cor do card do host por tipo/ícone — vale só quando online.
   * Offline/alerta continuam com colorOffline / colorAlert; sem dado na Query
   * (ou sem zabbixHost) continua com colorUnknown, nunca a cor do tipo.
   * Chave ausente = usa colorOnline.
   */
  hostTypeColors?: Partial<Record<TopologyHostIcon, string>>;
  /** Cor padrão dos rótulos estáticos */
  colorStatic: string;
  colorSubmap: string;
  colorLink: string;
  /** Animação download (sentido origem) */
  colorLinkDownload: string;
  /** Animação upload (sentido destino / seta) */
  colorLinkUpload: string;
  colorLinkWidth: number;
  /** Limiar de utilização (%) — atenção */
  linkUtilThresholdAttention: number;
  /** Limiar de utilização (%) — alto */
  linkUtilThresholdHigh: number;
  /** Limiar de utilização (%) — crítico / congestionamento */
  linkUtilThresholdCritical: number;
  /** Cor da animação em congestionamento */
  colorLinkCongestion: string;
  /** Retângulos de rede (agrupamento) */
  colorNetworkFill: string;
  colorNetworkBorder: string;
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
  legendAlert?: boolean;
  legendStatic?: boolean;
  legendSubmap?: boolean;
  legendLink?: boolean;
  legendDownload?: boolean;
  legendUpload?: boolean;
  /** Cores por tipo/ícone configuradas em hostTypeColors */
  legendHostTypes?: boolean;
  /** Templates visuais de host (sobrescrevem os padrão por id). */
  nodeTemplates?: TopologyNodeTemplate[];
  /** Regras automáticas host → template. */
  templateRules?: TopologyTemplateRule[];
  /** Modelos de topologia (POP, backbone, etc.). */
  topologyTemplates?: TopologyBlueprint[];
  /** Modo NOC — fontes maiores, filtros e badges; oculta edição. */
  nocMode?: boolean;
  /** Badges de problemas/tráfego nos hosts. */
  showHostBadges?: boolean;
}

export const defaultTopologyMap = (): TopologyMap => ({
  width: 1532,
  height: 923,
  networksLocked: true,
  nodes: [
    {
      id: 'network-1',
      label: 'REDE',
      type: 'network',
      x: 80,
      y: 180,
      width: 810,
      height: 660,
    },
    {
      id: 'static-1',
      label: 'CIDADE',
      type: 'static',
      fontSize: 80,
      x: 80,
      y: 40,
      width: 1360,
      height: 120,
    },
  ],
  links: [],
});

export const defaultStatusValueMappings = (): TopologyStatusValueMapping[] => [
  { value: 0, status: 'offline', label: 'Down' },
  { from: 0, status: 'online', label: 'Up' },
];

/** Cores por tipo — padrão atual dos mapas no Grafana. */
export const defaultHostTypeColors = (): NonNullable<TopologyPanelOptions['hostTypeColors']> => ({
  camera: '#84078b',
  firewall: '#5b4bc9',
  network: '#ffffff',
  power: '#ffe300',
  router: '#0009bc',
  vpn_server: '#0b6aae',
});

export const defaultOptions = (): TopologyPanelOptions => ({
  map: defaultTopologyMap(),
  colorOnline: '#28eb0e',
  colorOffline: '#ff0101',
  colorAlert: '#ff7300',
  colorUnknown: '#616161',
  statusValueMappings: defaultStatusValueMappings(),
  hostTypeColors: defaultHostTypeColors(),
  colorStatic: '#8f3bb8',
  colorSubmap: '#56A64B',
  colorLink: '#78909C',
  colorLinkDownload: '#C0D8FF',
  colorLinkUpload: '#FADE2A',
  colorLinkWidth: 2,
  linkUtilThresholdAttention: 50,
  linkUtilThresholdHigh: 75,
  linkUtilThresholdCritical: 90,
  colorLinkCongestion: '#ff7300',
  colorNetworkFill: 'rgba(96, 96, 96, 0.22)',
  colorNetworkBorder: '#8a8a8a',
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
  legendAlert: true,
  legendStatic: false,
  legendSubmap: true,
  legendLink: true,
  legendDownload: true,
  legendUpload: true,
  legendHostTypes: true,
  nocMode: false,
  showHostBadges: true,
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
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : undefined,
      nodes,
      links,
      locked: Boolean(parsed.locked),
      networksLocked: parsed.networksLocked !== false,
      hiddenHosts: Array.isArray(parsed.hiddenHosts) ? parsed.hiddenHosts : undefined,
      suggestedLinks: Array.isArray(parsed.suggestedLinks) ? parsed.suggestedLinks : undefined,
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

/** O que o modal de propriedades devolve ao salvar: patch do nó e, opcionalmente, troca de host. */
export interface NodeEditSavePayload {
  patch: Partial<TopologyNode>;
  rebind?: {
    visibleName: string;
    ip: string;
    icon: TopologyHostIcon;
  };
}
