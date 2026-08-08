import React from 'react';
import { TopologyHostIcon, TopologyNode } from '../types';

export const HOST_ICON_SIZE = 14;
export const HOST_ICON_GUTTER = 22;

export const HOST_ICON_LABELS: Record<TopologyHostIcon, string> = {
  router: 'Router',
  camera: 'Câmera',
  access_point: 'Access Point',
  bridge: 'Bridge',
  web: 'Web',
  proxmox: 'Proxmox',
  vmware: 'VMware',
  linux: 'Linux',
  windows: 'Windows',
  host: 'Host',
};

export const HOST_ICON_ORDER: TopologyHostIcon[] = [
  'router',
  'camera',
  'access_point',
  'bridge',
  'web',
  'proxmox',
  'vmware',
  'linux',
  'windows',
  'host',
];

/** SVG paths (viewBox 0 0 16 16) — ícones simples estilo The Dude */
const ICON_PATHS: Record<TopologyHostIcon, string[]> = {
  router: [
    'M2 12h12v2H2z M4 5h8v5H4z',
    'M8 2v2 M5 3.5l1.2 1 M11 3.5l-1.2 1',
  ],
  camera: ['M2 5h3l1-2h4l1 2h3v8H2z', 'M8 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z'],
  access_point: [
    'M8 13v-1',
    'M5.5 10.5a4 4 0 015 0',
    'M3.5 8a7 7 0 019 0',
    'M8 11a1 1 0 100-2 1 1 0 000 2z',
  ],
  bridge: ['M1 6h4v4H1z M11 6h4v4h-4z', 'M5 8h6 M7 7v2 M9 7v2'],
  web: ['M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z', 'M1.5 8h13 M8 1.5v13 M4 3.5c2 2.5 6 2.5 8 0 M4 12.5c2-2.5 6-2.5 8 0'],
  proxmox: ['M8 1.5l6 3.5v7L8 15.5 2 12V5z', 'M8 5v6 M5.5 6.5L8 8l2.5-1.5'],
  vmware: ['M3 6c0-2.2 2.2-4 5-4s5 1.8 5 4-2.2 4-5 4H5v3H3z', 'M5 10h6v2H5z'],
  linux: ['M8 2c-2 0-3.5 1.5-3.5 3.5 0 1.2.6 2.2 1.5 2.8-.3.8-.5 1.5-.5 2.2 0 2 1.6 3.5 3.5 3.5h1c1.9 0 3.5-1.5 3.5-3.5 0-.7-.2-1.4-.5-2.2.9-.6 1.5-1.6 1.5-2.8C11.5 3.5 10 2 8 2z'],
  windows: ['M1.5 2.5l5.5-1v5.5H1.5z M7.5 1.5L14 2.5v5H7.5z M1.5 8.5h5.5V14L1.5 12.5z M7.5 8.5H14V13l-6.5-1z'],
  host: ['M2 3h12v10H2z', 'M5 13h6'],
};

export function hostIconSelectOptions(): Array<{ label: string; value: TopologyHostIcon }> {
  return HOST_ICON_ORDER.map((id) => ({ label: HOST_ICON_LABELS[id], value: id }));
}

export function resolveHostIcon(node: Pick<TopologyNode, 'icon'>): TopologyHostIcon | null {
  return node.icon ?? null;
}

interface GlyphProps {
  icon: TopologyHostIcon;
  x: number;
  y: number;
  size?: number;
  color?: string;
}

export function HostIconGlyph({ icon, x, y, size = HOST_ICON_SIZE, color = 'rgba(255,255,255,0.92)' }: GlyphProps) {
  const paths = ICON_PATHS[icon] ?? ICON_PATHS.host;
  const scale = size / 16;
  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${scale})`} pointerEvents="none">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
