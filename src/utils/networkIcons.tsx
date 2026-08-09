import React, { FC, SVGProps } from 'react';
import { TopologyHostIcon } from '../types';

type NetIconProps = SVGProps<SVGSVGElement>;

const S = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

function NetIcon({ children, ...props }: NetIconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const RouterIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="3" y="10" width="18" height="8" rx="2" {...S} />
    <path d="M8 10V7M16 10V7" {...S} />
    <circle cx="8" cy="5.5" r="2" {...S} />
    <circle cx="16" cy="5.5" r="2" {...S} />
    <circle cx="8" cy="14" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none" />
  </NetIcon>
);

/** Switch de borda / multiserviço. */
export const BrasIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="1.5" y="7" width="21" height="11" rx="2" {...S} />
    <path d="M4 10.5h16M4 13.5h16M4 16.5h16" {...S} strokeWidth={1.5} />
    <path d="M6 7V4.5M12 7V3.5M18 7V4.5" {...S} strokeWidth={1.75} />
    <circle cx="6" cy="3.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="3.5" r="1.1" fill="currentColor" stroke="none" />
  </NetIcon>
);

export const SwitchManagedIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="1.5" y="9" width="21" height="7" rx="1.5" {...S} />
    <path d="M4.5 12v3.5M7.5 12v3.5M10.5 12v3.5M13.5 12v3.5M16.5 12v3.5M19.5 12v3.5" {...S} strokeWidth={1.75} />
    <circle cx="20" cy="6" r="2.5" {...S} />
    <path d="M20 4.5v3M18.5 6h3" {...S} strokeWidth={1.5} />
  </NetIcon>
);

export const SwitchUnmanagedIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="1.5" y="9" width="21" height="7" rx="1.5" {...S} />
    <path d="M3.5 12v3.5M6.5 12v3.5M9.5 12v3.5M12.5 12v3.5M15.5 12v3.5M18.5 12v3.5M21.5 12v3.5" {...S} strokeWidth={1.75} />
    <circle cx="4.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="19.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
  </NetIcon>
);

export const LoadBalancerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <circle cx="12" cy="5.5" r="2.75" {...S} />
    <path d="M12 8v3.5M7.5 17l4.5-5M16.5 17l-4.5-5" {...S} />
    <rect x="3.5" y="17" width="5.5" height="4" rx="1" {...S} />
    <rect x="15" y="17" width="5.5" height="4" rx="1" {...S} />
    <rect x="9.25" y="17" width="5.5" height="4" rx="1" {...S} />
  </NetIcon>
);

export const FirewallIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M12 2.5L3.5 6.5v5.5c0 5 3.8 8.5 8.5 10 4.7-1.5 8.5-5 8.5-10V6.5L12 2.5z" {...S} />
    <path d="M12 7.5v5.5M9 10h6" {...S} strokeWidth={2.25} />
  </NetIcon>
);

/** Concentrador BNG — tráfego convergindo para hub central. */
export const VpnIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="8.5" y="9" width="7" height="7" rx="1.5" {...S} />
    <path d="M12 9V6.5M12 16v2.5M12 6.5V4" {...S} />
    <path d="M8.5 12.5H5M15.5 12.5H19M10.5 9L6.5 5.5M13.5 9l4-3.5M10.5 16l-3.5 3.5M13.5 16l3.5 3.5" {...S} strokeWidth={1.75} />
    <circle cx="12" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
  </NetIcon>
);

export const OltIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="4.5" y="3.5" width="15" height="8.5" rx="1.5" {...S} />
    <circle cx="7.5" cy="7.75" r="1.4" fill="currentColor" stroke="none" />
    <path d="M11 7.75h7" {...S} strokeWidth={1.5} />
    <path d="M7.5 12v2M12 12v2M16.5 12v2" {...S} strokeWidth={1.75} />
    <circle cx="7.5" cy="17.5" r="1.75" {...S} />
    <circle cx="12" cy="17.5" r="1.75" {...S} />
    <circle cx="16.5" cy="17.5" r="1.75" {...S} />
  </NetIcon>
);

export const OnuIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="5.5" y="10" width="13" height="7.5" rx="1.5" {...S} />
    <path d="M9 13.5h6" {...S} strokeWidth={1.5} />
    <circle cx="12" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
    <path d="M12 10V6.5" {...S} />
    <path d="M9.5 6.5h5" {...S} />
    <circle cx="12" cy="4.5" r="1.75" {...S} />
  </NetIcon>
);

export const FiberIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M3 12c2.5-3.5 5-3.5 7.5 0s5 3.5 7.5 0 5-3.5 7.5 0" {...S} />
    <circle cx="12" cy="7" r="2.25" {...S} />
    <path d="M12 4.75V3M9.5 7.5L8 6M14.5 7.5L16 6" {...S} strokeWidth={1.5} />
  </NetIcon>
);

export const AccessPointIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M12 19v-2.5" {...S} />
    <path d="M8 16.5a6.5 6.5 0 018 0" {...S} />
    <path d="M5.5 13a10.5 10.5 0 0113 0" {...S} />
    <path d="M3 9.5a14 14 0 0118 0" {...S} strokeWidth={1.75} />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </NetIcon>
);

export const RadioIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M12 21V10" {...S} />
    <path d="M8.5 21h7" {...S} />
    <path d="M7.5 10h9" {...S} />
    <path d="M9.5 10V6.5l2.5-3.5 2.5 3.5V10" {...S} />
    <path d="M5.5 8l2 2M18.5 8l-2 2" {...S} strokeWidth={1.75} />
  </NetIcon>
);

export const TowerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M12 3l-3.5 18h7L12 3z" {...S} />
    <path d="M9 13h6M9.5 17h5" {...S} strokeWidth={1.5} />
    <path d="M6.5 21h11" {...S} />
    <circle cx="12" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
  </NetIcon>
);

export const SatelliteIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="7.5" y="7.5" width="9" height="5.5" rx="1" {...S} />
    <path d="M5 10H7.5M16.5 10H19M5 13H7.5M16.5 13H19" {...S} strokeWidth={1.5} />
    <path d="M12 13v3.5M9.5 16.5h5M10 19.5h4" {...S} />
    <path d="M3.5 18.5c2.5-1 5-1 7.5 0M13 18.5c2.5-1 5-1 7.5 0" {...S} strokeWidth={1.5} />
  </NetIcon>
);

export const MeshIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <circle cx="5.5" cy="17.5" r="2.5" {...S} />
    <circle cx="18.5" cy="17.5" r="2.5" {...S} />
    <circle cx="12" cy="6.5" r="2.5" {...S} />
    <path d="M7.5 15.5L10.5 9M16.5 15.5L13.5 9M8 17.5h8" {...S} />
  </NetIcon>
);

export const CameraIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M3.5 9v8a1.5 1.5 0 001.5 1.5h10a1.5 1.5 0 001.5-1.5V9" {...S} />
    <path d="M7.5 9l1.5-2.5h6L16.5 9" {...S} />
    <circle cx="12" cy="13" r="2.75" {...S} />
    <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
    <path d="M17.5 10.5v5l2.5 1.5V9l-2.5 1.5z" {...S} />
  </NetIcon>
);

export const BridgeIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="1.5" y="9.5" width="6.5" height="6" rx="1" {...S} />
    <rect x="16" y="9.5" width="6.5" height="6" rx="1" {...S} />
    <path d="M8 12.5h8" {...S} />
    <circle cx="12" cy="12.5" r="2.25" {...S} />
    <path d="M10.75 12.5h2.5" {...S} strokeWidth={2.75} />
  </NetIcon>
);

/** Energia — UPS, nobreak ou alimentação. */
export const PowerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="5.5" y="3.5" width="13" height="17" rx="2" {...S} />
    <path d="M13.5 7L10 13h3.5l-1.5 6.5L16.5 11H13l.5-4z" fill="currentColor" stroke="none" />
    <path d="M8.5 19h7" {...S} strokeWidth={1.5} opacity={0.55} />
  </NetIcon>
);

export const ServerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="3.5" y="2.5" width="17" height="6.5" rx="1.5" {...S} />
    <rect x="3.5" y="10.5" width="17" height="6.5" rx="1.5" {...S} />
    <circle cx="6.5" cy="5.75" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="13.75" r="0.9" fill="currentColor" stroke="none" />
    <path d="M9.5 5.75h9M9.5 13.75h9" {...S} strokeWidth={1.5} />
    <path d="M3.5 19.5h17" {...S} strokeWidth={1.5} opacity={0.45} />
  </NetIcon>
);

export const RackIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="5.5" y="1.5" width="13" height="21" rx="1.5" {...S} />
    <path d="M7.5 5.5h10M7.5 9h10M7.5 12.5h10M7.5 16h10M7.5 19.5h10" {...S} strokeWidth={1.25} />
    <circle cx="8.75" cy="5.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="8.75" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="8.75" cy="19.5" r="0.7" fill="currentColor" stroke="none" />
  </NetIcon>
);

export const DnsIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <circle cx="12" cy="12" r="8.5" {...S} />
    <path d="M3.5 12h17M12 3.5a12.5 12.5 0 010 17M12 3.5a12.5 12.5 0 000 17" {...S} strokeWidth={1.5} />
    <path d="M8.5 9h7M8.5 12h5M8.5 15h6" {...S} strokeWidth={1.75} />
  </NetIcon>
);

/** Cloud — links externos. */
export const CloudIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path
      d="M7 18h10.5a3.5 3.5 0 000-7 4.5 4.5 0 00-8.7-1.5A3.5 3.5 0 007 18z"
      {...S}
    />
    <path d="M9 15.5h6" {...S} strokeWidth={1.5} opacity={0.55} />
  </NetIcon>
);

/** Servidor VPN — rack com cadeado. */
export const VpnServerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="3.5" y="2.5" width="17" height="6" rx="1.5" {...S} />
    <rect x="3.5" y="10" width="17" height="6" rx="1.5" {...S} />
    <circle cx="6.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="13" r="0.9" fill="currentColor" stroke="none" />
    <path d="M9.5 5.5h9M9.5 13h7" {...S} strokeWidth={1.5} />
    <rect x="14.5" y="17.5" width="5.5" height="4" rx="1" {...S} />
    <path d="M15.75 17.5v-1.75a2.25 2.25 0 014.5 0v1.75" {...S} strokeWidth={1.75} />
    <circle cx="17.25" cy="19.5" r="0.75" fill="currentColor" stroke="none" />
  </NetIcon>
);

/** DVR / NVR — gravador com baias de disco e câmera. */
export const DvrIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="2" y="9" width="20" height="11" rx="2" {...S} />
    <rect x="4.5" y="12" width="3.5" height="5.5" rx="0.75" {...S} />
    <rect x="9.25" y="12" width="3.5" height="5.5" rx="0.75" {...S} />
    <rect x="14" y="12" width="3.5" height="5.5" rx="0.75" {...S} />
    <circle cx="19.25" cy="10.5" r="0.85" fill="currentColor" stroke="none" />
    <path d="M8.5 9V7a1.25 1.25 0 011.25-1.25h5.5A1.25 1.25 0 0116.25 7V9" {...S} strokeWidth={1.5} />
    <circle cx="12" cy="5.25" r="2.25" {...S} />
    <circle cx="12" cy="5.25" r="0.85" fill="currentColor" stroke="none" />
    <path d="M9.25 5.25h5.5" {...S} strokeWidth={1.5} opacity={0.55} />
  </NetIcon>
);

type NetworkIconComponent = FC<NetIconProps>;

export const NETWORK_ICON_COMPONENTS: Partial<Record<TopologyHostIcon, NetworkIconComponent>> = {
  router: RouterIcon,
  bras: BrasIcon,
  switch_managed: SwitchManagedIcon,
  switch_unmanaged: SwitchUnmanagedIcon,
  load_balancer: LoadBalancerIcon,
  firewall: FirewallIcon,
  vpn: VpnIcon,
  vpn_server: VpnServerIcon,
  olt: OltIcon,
  onu: OnuIcon,
  fiber: FiberIcon,
  access_point: AccessPointIcon,
  radio: RadioIcon,
  tower: TowerIcon,
  satellite: SatelliteIcon,
  mesh: MeshIcon,
  camera: CameraIcon,
  dvr: DvrIcon,
  bridge: BridgeIcon,
  power: PowerIcon,
  server: ServerIcon,
  rack: RackIcon,
  dns: DnsIcon,
  network: CloudIcon,
};

export function isNetworkHostIcon(icon: TopologyHostIcon): boolean {
  return icon in NETWORK_ICON_COMPONENTS;
}
