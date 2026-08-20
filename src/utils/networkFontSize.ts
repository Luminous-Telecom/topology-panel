import { TopologyPanelOptions } from '../types';

/** Fonte das caixas de rede — `networkFontSize` no painel, com fallback em `nodeFontSize`. */
export function resolveNetworkFontSize(options: Pick<TopologyPanelOptions, 'networkFontSize' | 'nodeFontSize'>): number {
  const size = options.networkFontSize ?? options.nodeFontSize;
  return Number.isFinite(size) && size > 0 ? size : 11;
}
