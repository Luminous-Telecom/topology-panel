import { TopologyHostIcon } from '../types';
import apSvg from '../img/topology/ap.svg';
import bridgeSvg from '../img/topology/bridge.svg';
import cameraSvg from '../img/topology/camera.svg';
import globeSvg from '../img/topology/globe.svg';
import laptopSvg from '../img/topology/laptop.svg';
import routerBngSvg from '../img/topology/router_bng.svg';
import routerSvg from '../img/topology/router.svg';
import serverSvg from '../img/topology/server.svg';
import switchSvg from '../img/topology/switch.svg';

/** Ícones Dude (pasta icons/) — SVG inline (evita URL quebrada no Grafana). */
export const CUSTOM_ICON_SVGS: Partial<Record<TopologyHostIcon, string>> = {
  router: routerSvg,
  bras: switchSvg,
  switch_managed: switchSvg,
  switch_unmanaged: switchSvg,
  vpn: routerBngSvg,
  access_point: apSvg,
  bridge: bridgeSvg,
  camera: cameraSvg,
  network: globeSvg,
  server: serverSvg,
  dns: serverSvg,
  onu: laptopSvg,
  host: laptopSvg,
};

export function isCustomAssetIcon(icon: TopologyHostIcon): boolean {
  return icon in CUSTOM_ICON_SVGS;
}

/** Switch não gerenciável: silhueta branca sobre o fundo colorido do nó. */
export const SWITCH_UNMANAGED_ICON_FILTER = 'brightness(0) invert(1)';

/** Ajusta SVG importado para render inline com tamanho fixo. */
export function inlineSvgMarkup(svg: string, size: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s(width|height)=(".*?"|'.*?')/gi, '')
      .replace(/\sstyle=(".*?"|'.*?')/gi, '');
    return `<svg${cleaned} width="${size}" height="${size}" style="display:block" preserveAspectRatio="xMidYMid meet">`;
  });
}
