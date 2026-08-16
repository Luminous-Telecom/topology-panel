import React from 'react';
import { IconType } from 'react-icons';
import { FaDesktop, FaGlobe, FaLinux, FaWindows } from 'react-icons/fa6';
import { SiProxmox, SiVmware } from 'react-icons/si';
import { TopologyHostIcon } from '../types';
import {
  CUSTOM_ICON_SVGS,
  inlineSvgMarkup,
  isCustomAssetIcon,
  PASSIVE_CUSTOM_ICONS,
  PASSIVE_ICON_FILTER,
} from './customIcons';
import { isNetworkHostIcon, NETWORK_ICON_COMPONENTS } from './networkIcons';

export const HOST_ICON_SIZE = 28;
export const HOST_ICON_GAP = 6;

/** Escala horizontal — equipamentos rack/chassis mais largos que altos. */
const HOST_ICON_WIDTH_SCALE: Partial<Record<TopologyHostIcon, number>> = {
  olt: 2,
  dvr: 1.35,
};

/** Escala por tipo — switches e equipamentos largos um pouco maiores no mapa. */
const HOST_ICON_SIZE_SCALE: Partial<Record<TopologyHostIcon, number>> = {
  switch_managed: 1.45,
  switch_unmanaged: 1.45,
  camera: 1.3,
  dvr: 1.25,
  power: 1.25,
  bras: 1.25,
  router: 1.2,
  vpn: 1.2,
  vpn_server: 1.2,
  network: 1.15,
  access_point: 1.2,
};

export function hostIconRenderSize(icon: TopologyHostIcon, base = HOST_ICON_SIZE): number {
  const scale = HOST_ICON_SIZE_SCALE[icon] ?? 1;
  return Math.round(base * scale);
}

export function hostIconRenderDimensions(
  icon: TopologyHostIcon,
  base = HOST_ICON_SIZE
): { w: number; h: number } {
  const h = hostIconRenderSize(icon, base);
  const wScale = HOST_ICON_WIDTH_SCALE[icon] ?? 1;
  return { w: Math.round(h * wScale), h };
}

export const HOST_ICON_LABELS: Record<TopologyHostIcon, string> = {
  router: 'Router',
  bras: 'Switch borda',
  switch_managed: 'Switch gerenciável',
  switch_unmanaged: 'Switch não gerenciável',
  load_balancer: 'Load balancer',
  firewall: 'Firewall',
  vpn: 'Concentrador BNG',
  vpn_server: 'Servidor VPN',
  olt: 'OLT',
  onu: 'ONU / modem',
  fiber: 'Fibra óptica',
  access_point: 'Access Point',
  radio: 'Rádio / antena',
  tower: 'Torre',
  satellite: 'Satélite',
  mesh: 'Mesh / rede',
  camera: 'Câmera',
  dvr: 'DVR / NVR',
  bridge: 'Bridge',
  power: 'Energia',
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
  'switch_managed',
  'switch_unmanaged',
  'firewall',
  'vpn_server',
  'olt',
  'access_point',
  'camera',
  'dvr',
  'bridge',
  'power',
  'server',
  'network',
];

/** Ícones react-icons só para tipos legados (mapas antigos). */
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
const MANAGED_HOST_ICONS: TopologyHostIcon[] = [
  'router',
  'bras',
  'switch_managed',
  'firewall',
  'vpn',
  'vpn_server',
  'olt',
  'server',
  'access_point',
  'dvr',
];

/** Cor padrão dos ícones gerenciáveis no mapa. */
const MANAGED_ICON_COLOR = '#4FC3F7';

/** Switch não gerenciável e demais ícones passivos — branco. */
const PASSIVE_ICON_COLOR = 'rgba(255,255,255,0.92)';

function isManagedHostIcon(icon: TopologyHostIcon): boolean {
  return MANAGED_HOST_ICONS.includes(icon);
}

function isPassiveCustomIcon(icon: TopologyHostIcon): boolean {
  return PASSIVE_CUSTOM_ICONS.includes(icon);
}

function hostIconColor(icon: TopologyHostIcon): string {
  if (isCustomAssetIcon(icon)) {
    return isPassiveCustomIcon(icon) ? PASSIVE_ICON_COLOR : MANAGED_ICON_COLOR;
  }
  if (isManagedHostIcon(icon)) {
    return MANAGED_ICON_COLOR;
  }
  if (isNetworkHostIcon(icon) || icon === 'switch_unmanaged') {
    return PASSIVE_ICON_COLOR;
  }
  const brand = BRAND_ICON_COLORS[icon];
  if (brand) {
    return brand;
  }
  if (LEGACY_ICON_COMPONENTS[icon]) {
    return PASSIVE_ICON_COLOR;
  }
  throw new Error(`Cor de ícone não definida: ${icon}`);
}

interface IconImageProps {
  icon: TopologyHostIcon;
  size?: number;
  color?: string;
  className?: string;
  /** true = mapa; false = picker/modal */
  onMap?: boolean;
}

/** Só ícones passivos (ex.: switch não gerenciável) viram silhueta branca no mapa. */
function mapIconFilter(icon: TopologyHostIcon, onMap: boolean): string | undefined {
  if (onMap && isPassiveCustomIcon(icon)) {
    return PASSIVE_ICON_FILTER;
  }
  return undefined;
}

/** Ícone de topologia (SVG inline), desenhado ou legado (react-icons). */
export function HostIconImage({ icon, size = 20, color, className, onMap = false }: IconImageProps) {
  const customSvg = CUSTOM_ICON_SVGS[icon];
  if (customSvg) {
    const widthScale = HOST_ICON_WIDTH_SCALE[icon] ?? 1;
    const width = Math.round(size * widthScale);
    const style: React.CSSProperties = {
      display: 'block',
      width,
      height: size,
      lineHeight: 0,
      overflow: 'hidden',
    };
    const filter = mapIconFilter(icon, onMap);
    if (filter) {
      style.filter = filter;
    }
    return (
      <span
        className={className}
        style={style}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: inlineSvgMarkup(customSvg, size, widthScale) }}
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

  const Icon = LEGACY_ICON_COMPONENTS[icon];
  if (!Icon) {
    return null;
  }
  const fill = color ?? hostIconColor(icon);
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
  const { w, h } = hostIconRenderDimensions(icon, size);
  return (
    <foreignObject
      x={x - w / 2}
      y={y - h / 2}
      width={w}
      height={h}
      pointerEvents="none"
    >
      <div
        style={{
          width: w,
          height: h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
          overflow: 'hidden',
          color: iconColor,
          background: 'transparent',
        }}
      >
        <HostIconImage icon={icon} size={h} color={iconColor} onMap />
      </div>
    </foreignObject>
  );
}
