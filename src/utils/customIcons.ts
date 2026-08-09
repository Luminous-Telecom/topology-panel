import { TopologyHostIcon } from '../types';
import apSvg from '../img/topology/ap.svg';
import bridgeSvg from '../img/topology/bridge.svg';
import cameraSvg from '../img/topology/camera.svg';
import firewallSvg from '../img/topology/firewall.svg';
import globeSvg from '../img/topology/globe.svg';
import laptopSvg from '../img/topology/laptop.svg';
import meshSvg from '../img/topology/mesh.svg';
import oltSvg from '../img/topology/olts.svg';
import powerSvg from '../img/topology/power.svg';
import routerSvg from '../img/topology/router.svg';
import serverSvg from '../img/topology/server.svg';
import switchSvg from '../img/topology/switch.svg';

/** Ícones em src/img/topology/ — SVG inline (evita URL quebrada no Grafana). */
export const CUSTOM_ICON_SVGS: Partial<Record<TopologyHostIcon, string>> = {
  router: routerSvg,
  bras: switchSvg,
  switch_managed: switchSvg,
  switch_unmanaged: switchSvg,
  firewall: firewallSvg,
  olt: oltSvg,
  access_point: apSvg,
  mesh: meshSvg,
  camera: cameraSvg,
  bridge: bridgeSvg,
  power: powerSvg,
  server: serverSvg,
  network: globeSvg,
  host: laptopSvg,
};

export function isCustomAssetIcon(icon: TopologyHostIcon): boolean {
  return icon in CUSTOM_ICON_SVGS;
}

/** Só switch não gerenciável — silhueta branca no mapa. */
export const PASSIVE_CUSTOM_ICONS: TopologyHostIcon[] = ['switch_unmanaged'];

/** Silhueta branca sobre o fundo colorido do nó. */
export const PASSIVE_ICON_FILTER = 'brightness(0) invert(1)';

/** Ajusta SVG importado para render inline com tamanho fixo. */
export function inlineSvgMarkup(svg: string, size: number, widthScale = 1): string {
  const width = Math.round(size * widthScale);
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s(width|height)=(".*?"|'.*?')/gi, '')
      .replace(/\sstyle=(".*?"|'.*?')/gi, '');
    return `<svg${cleaned} width="${width}" height="${size}" style="display:block" preserveAspectRatio="xMidYMid meet">`;
  });
}
