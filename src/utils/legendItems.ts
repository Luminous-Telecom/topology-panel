import { TopologyHostIcon, TopologyPanelOptions } from '../types';
import { HOST_ICON_LABELS } from './hostIcons';

export interface LegendItem {
  label: string;
  color: string;
}

/**
 * Itens da legenda, na ordem em que aparecem no mapa.
 *
 * Status (sem dados, online, offline, alerta) entram por padrão — `!== false` — porque são o que
 * qualquer mapa mostra; os demais só entram se o usuário ligar.
 */
export function buildLegendItems(options: TopologyPanelOptions): LegendItem[] {
  if (options.showLegend === false) {
    return [];
  }
  const items: LegendItem[] = [];
  if (options.legendUnknown !== false) {
    items.push({ label: 'Sem dados', color: options.colorUnknown });
  }
  if (options.legendOnline !== false) {
    items.push({ label: 'Online', color: options.colorOnline });
  }
  if (options.legendOffline !== false) {
    items.push({ label: 'Offline', color: options.colorOffline });
  }
  if (options.legendAlert !== false) {
    items.push({ label: 'Alerta', color: options.colorAlert });
  }
  if (options.legendStatic) {
    items.push({ label: 'Estático', color: options.colorStatic });
  }
  if (options.legendSubmap) {
    items.push({ label: 'Submapa', color: options.colorSubmap });
  }
  if (options.legendLink) {
    items.push({ label: 'Cabos', color: options.colorLink });
  }
  if (options.legendDownload) {
    items.push({ label: 'Download (origem)', color: options.colorLinkDownload });
  }
  if (options.legendUpload) {
    items.push({ label: 'Upload (destino)', color: options.colorLinkUpload });
  }
  if (options.legendHostTypes) {
    for (const [icon, color] of Object.entries(options.hostTypeColors ?? {})) {
      const trimmed = color?.trim();
      if (!trimmed) {
        continue;
      }
      items.push({ label: HOST_ICON_LABELS[icon as TopologyHostIcon], color: trimmed });
    }
  }
  return items;
}
