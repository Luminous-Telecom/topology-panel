import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
  TopologyHostStatus,
} from '../types';
import { RegionHostStats, regionFillColor } from './networkStats';
import { hostTypeFillColor } from './panelColors';
import { lookupHostDisplay } from './queryHosts';
import { resolveHostProblemSummary } from './noc/topologyFilters';
import { HostProblemsMap } from './noc/types';

/** Converte cor de opção do painel (hex, rgb ou nome de tema) em cor final. */
export type ColorResolver = (color?: unknown) => string;

function resolveEffectiveHostStatus(
  node: TopologyNode,
  mappedStatus: TopologyHostStatus | undefined
): TopologyHostStatus | undefined {
  if (mappedStatus === 'offline') {
    return 'offline';
  }
  if (mappedStatus === 'alert') {
    return 'alert';
  }
  return mappedStatus;
}

/**
 * Cor de preenchimento de um host: status da Query e problemas Zabbix (Warning+).
 *
 * Offline (`colorOffline`) vence alerta. Alerta da Query ou problema Zabbix usam `colorAlert`.
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
  const status = resolveEffectiveHostStatus(node, mapped?.status);
  const hasZabbixProblem = resolveHostProblemSummary(node, hostMetadata, hostProblems) !== undefined;
  const typeFill = hostTypeFillColor(node.icon, options.hostTypeColors);
  if (status === 'offline') {
    const offlineColor = resolveMappedColor?.(options.colorOffline);
    return offlineColor ?? options.colorOffline;
  }
  if (status === 'alert' || hasZabbixProblem) {
    const alertColor = resolveMappedColor?.(options.colorAlert);
    return alertColor ?? options.colorAlert;
  }
  if (!mapped?.color) {
    return options.colorUnknown;
  }
  if (status === 'online' && typeFill) {
    return typeFill;
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
