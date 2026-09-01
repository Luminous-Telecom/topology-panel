import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import { RegionHostStats, regionFillColor } from './networkStats';
import { hostTypeFillColor } from './panelColors';
import { lookupHostDisplay } from './queryHosts';
import { statusFromHostDisplay } from './statusMapping';
import { resolveHostProblemSummary } from './noc/topologyFilters';
import { HostProblemsMap } from './noc/types';

/** Converte cor de opção do painel (hex, rgb ou nome de tema) em cor final. */
export type ColorResolver = (color?: unknown) => string;

/**
 * Card visível no mapa escuro enquanto o lastvalue não chegou.
 * Sem cor de tipo/submapa — isso parecia status real na abertura.
 */
export const NODE_FILL_WAITING = '#2a313c';

/** Host/submapa ainda sem lastvalue — não pintar status. */
function isNodeStatusFillPending(
  node: TopologyNode,
  queryReady: boolean | undefined,
  queryLoading = false,
  region?: RegionHostStats
): boolean {
  if (node.type !== 'submap' && node.type !== 'host') {
    return false;
  }
  return !queryReady || queryLoading || Boolean(region?.loadPending);
}

/**
 * Cor de preenchimento de um host: status da Query e problemas Zabbix (Warning+).
 *
 * Offline (`colorOffline`) vence alerta. Problema Zabbix (Warning+) em host online usa `colorAlert`.
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
    zabbixHostId: node.zabbixHostId,
  };
  const mapped = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  const status = statusFromHostDisplay(mapped);
  const hasZabbixProblem = resolveHostProblemSummary(node, hostMetadata, hostProblems) !== undefined;
  const typeFill = hostTypeFillColor(node.icon, options.hostTypeColors);
  if (status === 'offline') {
    const offlineColor = resolveMappedColor?.(options.colorOffline);
    return offlineColor ?? options.colorOffline;
  }
  if (status === 'alert' || (status === 'online' && hasZabbixProblem)) {
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
  hostProblems?: HostProblemsMap,
  queryLoading = false
): string {
  if (isNodeStatusFillPending(node, queryReady, queryLoading, region)) {
    return NODE_FILL_WAITING;
  }
  const fillOverride =
    node.type === 'submap' ? regionFillColor(region, options, 'submap', queryReady) : undefined;
  const fillRaw =
    fillOverride ??
    (node.fillColor ? node.fillColor : undefined) ??
    hostNodeFill(node, options, hostMetadata, hostDisplay, resolveColor, hostProblems);
  return resolveColor(fillRaw);
}
