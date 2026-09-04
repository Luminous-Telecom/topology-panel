import { TopologyHostIcon } from '../types';
import apSvg from '../img/topology/ap.svg';
import bridgeSvg from '../img/topology/bridge.svg';
import cameraSvg from '../img/topology/camera.svg';
import cloudSvg from '../img/topology/cloud.svg';
import dvrSvg from '../img/topology/dvr.svg';
import firewallSvg from '../img/topology/firewall.svg';
import laptopSvg from '../img/topology/laptop.svg';
import oltSvg from '../img/topology/olts.svg';
import powerSvg from '../img/topology/power.svg';
import routerSvg from '../img/topology/router.svg';
import serverSvg from '../img/topology/server.svg';
import switchSvg from '../img/topology/switch.svg';
import switchUnmanagedSvg from '../img/topology/switch_unmanaged.svg';
import vpnServerSvg from '../img/topology/vpn_server.svg';

/** Ícones em src/img/topology/ — SVG inline (estilo NOC Cisco via marrow-cli; ver npm run icons:sync). */
export const CUSTOM_ICON_SVGS: Partial<Record<TopologyHostIcon, string>> = {
  router: routerSvg,
  switch_managed: switchSvg,
  switch_unmanaged: switchUnmanagedSvg,
  firewall: firewallSvg,
  vpn_server: vpnServerSvg,
  olt: oltSvg,
  access_point: apSvg,
  camera: cameraSvg,
  dvr: dvrSvg,
  bridge: bridgeSvg,
  power: powerSvg,
  server: serverSvg,
  cloud: cloudSvg,
  network: cloudSvg,
  host: laptopSvg,
};

export function isCustomAssetIcon(icon: TopologyHostIcon): boolean {
  return icon in CUSTOM_ICON_SVGS;
}

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
