import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyHostStatus,
} from '../types';
import { RegionHostStats, regionFillColor } from './networkStats';
import { resolveHostProblemSummary } from './noc/topologyFilters';
import { hostTypeFillColor } from './panelColors';
import { lookupHostDisplay } from './queryHosts';
import { HostProblemsMap } from './noc/types';

/** Converte cor de opção do painel (hex, rgb ou nome de tema) em cor final. */
export type ColorResolver = (color?: unknown) => string;

function resolveEffectiveHostStatus(
  node: TopologyNode,
  mappedStatus: TopologyHostStatus | undefined,
  hostMetadata?: HostMetadataMap,
  hostProblems?: HostProblemsMap
): TopologyHostStatus | undefined {
  if (mappedStatus === 'offline') {
    return 'offline';
  }
  if (mappedStatus === 'alert' || resolveHostProblemSummary(node, hostMetadata, hostProblems)) {
    return 'alert';
  }
  return mappedStatus;
}

/**
 * Cor de preenchimento de um host a partir do status vindo da Query.
 *
 * Problemas ativos no Zabbix pintam com `colorAlert`. Offline no mapa usa `colorOffline`.
 * No hover ICMP, a linha fica verde e o vermelho marca só os pontos de falha.
 */
export function hostNodeFill(
  node: TopologyNode,
  options: TopologyPanelOptions,
  hostMetadata?: HostMetadataMap,
  hostDisplay?: HostDisplayMap,
  resolveMappedColor?: (color?: unknown) => string | undefined,
  hostProblems?: HostProblemsMap
): string {
  if (node.type === 'submap') {
    return options.colorSubmap;
  }
  if (node.type === 'dashboard_picker') {
    return node.fillColor || options.colorSubmap;
  }
  if (node.type === 'static') {
    return node.fillColor || options.colorStatic;
  }
  if (!node.zabbixHost?.trim()) {
    return options.colorUnknown;
  }
  const lookupRef = {
    zabbixHost: node.zabbixHost,
    subtitle: node.subtitle,
    label: node.label,
  };
  const mapped = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  if (!mapped?.color) {
    return options.colorUnknown;
  }
  const status = resolveEffectiveHostStatus(node, mapped.status, hostMetadata, hostProblems);
  const typeFill = hostTypeFillColor(node.icon, options.hostTypeColors);
  if (status === 'online' && typeFill) {
    return typeFill;
  }
  if (status === 'alert') {
    const alertColor = resolveMappedColor?.(options.colorAlert);
    return alertColor ?? options.colorAlert;
  }
  if (status === 'offline') {
    const offlineColor = resolveMappedColor?.(options.colorOffline);
    return offlineColor ?? options.colorOffline;
  }
  const color = resolveMappedColor?.(mapped.color);
  if (!color) {
    return options.colorUnknown;
  }
  return color;
}

/**
 * Cor final da caixa de rede. Precedência: status agregado da região, cor manual do nó, padrão do
 * painel. Usada no mapa e no minimapa, que precisam concordar.
 */
export function resolveNetworkFill(
  node: TopologyNode,
  stats: RegionHostStats | undefined,
  options: TopologyPanelOptions,
  queryReady: boolean | undefined,
  resolveColor: ColorResolver
): string {
  const fillOverride = regionFillColor(stats, options, 'network', queryReady);
  const fillRaw =
    fillOverride ?? (node.fillColor ? node.fillColor : undefined) ?? options.colorNetworkFill;
  return resolveColor(fillRaw);
}

/**
 * Cor final de host, submapa, texto e seletor. Precedência: status agregado (só submapa), cor
 * manual do nó, cor derivada do status do host.
 */
export function resolveNodeFill(
  node: TopologyNode,
  region: RegionHostStats | undefined,
  options: TopologyPanelOptions,
  queryReady: boolean | undefined,
  hostMetadata: HostMetadataMap | undefined,
  hostDisplay: HostDisplayMap | undefined,
  resolveColor: ColorResolver,
  hostProblems?: HostProblemsMap
): string {
  const fillOverride =
    node.type === 'submap' ? regionFillColor(region, options, 'submap', queryReady) : undefined;
  const fillRaw =
    fillOverride ??
    (node.fillColor ? node.fillColor : undefined) ??
    hostNodeFill(node, options, hostMetadata, hostDisplay, resolveColor, hostProblems);
  return resolveColor(fillRaw);
}
