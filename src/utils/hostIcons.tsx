import React from 'react';
import { IconType } from 'react-icons';
import { FaDesktop, FaGlobe, FaLinux, FaWindows } from 'react-icons/fa6';
import { SiProxmox, SiVmware } from 'react-icons/si';
import { TopologyHostIcon, TopologyNode } from '../types';
import { CUSTOM_ICON_SVGS, inlineSvgMarkup, isCustomAssetIcon, SWITCH_UNMANAGED_ICON_FILTER } from './customIcons';
import { isNetworkHostIcon, NETWORK_ICON_COMPONENTS } from './networkIcons';

export const HOST_ICON_SIZE = 28;
export const HOST_ICON_GAP = 6;

/** Escala por tipo — switches e equipamentos largos um pouco maiores no mapa. */
export const HOST_ICON_SIZE_SCALE: Partial<Record<TopologyHostIcon, number>> = {
  switch_managed: 1.45,
  switch_unmanaged: 1.45,
  camera: 1.3,
  rack: 1.25,
  bras: 1.25,
  router: 1.2,
  vpn: 1.2,
  network: 1.15,
  access_point: 1.2,
};

export function hostIconRenderSize(icon: TopologyHostIcon, base = HOST_ICON_SIZE): number {
  const scale = HOST_ICON_SIZE_SCALE[icon] ?? 1;
  return Math.round(base * scale);
}

export const HOST_ICON_LABELS: Record<TopologyHostIcon, string> = {
  router: 'Router',
  bras: 'Switch borda',
  switch_managed: 'Switch gerenciável',
  switch_unmanaged: 'Switch não gerenciável',
  load_balancer: 'Load balancer',
  firewall: 'Firewall',
  vpn: 'Concentrador BNG',
  olt: 'OLT',
  onu: 'ONU / modem',
  fiber: 'Fibra óptica',
  access_point: 'Access Point',
  radio: 'Rádio / antena',
  tower: 'Torre',
  satellite: 'Satélite',
  mesh: 'Mesh / rede',
  camera: 'Câmera',
  bridge: 'Bridge',
  server: 'Servidor',
  rack: 'Rack',
  dns: 'DNS',
  network: 'Cloud / links externos',
  web: 'Web',
  proxmox: 'Proxmox',
  vmware: 'VMware',
  linux: 'Linux',
  windows: 'Windows',
  host: 'Host',
};

export const HOST_ICON_ORDER: TopologyHostIcon[] = [
  'router',
  'bras',
  'switch_managed',
  'switch_unmanaged',
  'load_balancer',
  'firewall',
  'vpn',
  'olt',
  'onu',
  'fiber',
  'access_point',
  'radio',
  'tower',
  'satellite',
  'mesh',
  'camera',
  'bridge',
  'server',
  'rack',
  'dns',
  'network',
];

/** Fallback react-icons só para tipos legados (mapas antigos). */
const LEGACY_ICON_COMPONENTS: Partial<Record<TopologyHostIcon, IconType>> = {
  web: FaGlobe,
  proxmox: SiProxmox,
  vmware: SiVmware,
  linux: FaLinux,
  windows: FaWindows,
  host: FaDesktop,
};

const BRAND_ICON_COLORS: Partial<Record<TopologyHostIcon, string>> = {
  proxmox: '#E57000',
  vmware: '#696566',
  linux: '#FCC624',
  windows: '#00A4EF',
};

/** Equipamentos gerenciáveis — mesma cor padrão no mapa. */
export const MANAGED_HOST_ICONS: TopologyHostIcon[] = [
  'router',
  'bras',
  'switch_managed',
  'load_balancer',
  'firewall',
  'vpn',
  'olt',
  'dns',
  'server',
  'rack',
  'access_point',
];

/** Cor padrão dos ícones gerenciáveis no mapa. */
export const MANAGED_ICON_COLOR = '#4FC3F7';

/** Switch não gerenciável e demais ícones passivos — branco. */
export const PASSIVE_ICON_COLOR = 'rgba(255,255,255,0.92)';

export function isManagedHostIcon(icon: TopologyHostIcon): boolean {
  return MANAGED_HOST_ICONS.includes(icon);
}

export function hostIconColor(icon: TopologyHostIcon, fallback = PASSIVE_ICON_COLOR): string {
  if (isCustomAssetIcon(icon)) {
    return icon === 'switch_unmanaged' ? PASSIVE_ICON_COLOR : MANAGED_ICON_COLOR;
  }
  if (isManagedHostIcon(icon)) {
    return MANAGED_ICON_COLOR;
  }
  if (isNetworkHostIcon(icon) || icon === 'switch_unmanaged') {
    return PASSIVE_ICON_COLOR;
  }
  return BRAND_ICON_COLORS[icon] ?? fallback;
}

export function hostIconSelectOptions(): Array<{ label: string; value: TopologyHostIcon }> {
  return HOST_ICON_ORDER.map((id) => ({ label: HOST_ICON_LABELS[id], value: id }));
}

export function resolveHostIcon(node: Pick<TopologyNode, 'icon'>): TopologyHostIcon | null {
  return node.icon ?? null;
}

interface IconImageProps {
  icon: TopologyHostIcon;
  size?: number;
  color?: string;
  className?: string;
}

/** Ícone Dude (SVG inline), desenhado ou legado (react-icons). */
export function HostIconImage({ icon, size = 20, color, className }: IconImageProps) {
  const customSvg = CUSTOM_ICON_SVGS[icon];
  if (customSvg) {
    const style: React.CSSProperties = {
      display: 'block',
      width: size,
      height: size,
      lineHeight: 0,
      overflow: 'hidden',
    };
    if (icon === 'switch_unmanaged') {
      style.filter = SWITCH_UNMANAGED_ICON_FILTER;
    }
    return (
      <span
        className={className}
        style={style}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: inlineSvgMarkup(customSvg, size) }}
      />
    );
  }

  const NetIcon = NETWORK_ICON_COMPONENTS[icon];
  if (NetIcon) {
    const fill = color ?? hostIconColor(icon);
    return (
      <NetIcon
        width={size}
        height={size}
        color={fill}
        className={className}
        style={{ display: 'block', color: fill }}
      />
    );
  }

  const Icon = LEGACY_ICON_COMPONENTS[icon] ?? LEGACY_ICON_COMPONENTS.host ?? FaDesktop;
  const fill = color ?? hostIconColor(icon, 'currentColor');
  return <Icon size={size} color={fill} className={className} aria-hidden />;
}

interface GlyphProps {
  icon: TopologyHostIcon;
  x: number;
  y: number;
  size?: number;
  color?: string;
}

/** Ícone dentro do SVG do mapa (foreignObject). */
export function HostIconGlyph({ icon, x, y, size = HOST_ICON_SIZE, color }: GlyphProps) {
  const iconColor = color ?? hostIconColor(icon);
  return (
    <foreignObject
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      pointerEvents="none"
    >
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
          overflow: 'hidden',
          color: iconColor,
        }}
      >
        <HostIconImage icon={icon} size={size} color={iconColor} />
      </div>
    </foreignObject>
  );
}
