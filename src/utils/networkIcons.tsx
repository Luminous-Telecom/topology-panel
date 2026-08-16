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

/** Switch de borda / multiserviço. */
const BrasIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="1.5" y="7" width="21" height="11" rx="2" {...S} />
    <path d="M4 10.5h16M4 13.5h16M4 16.5h16" {...S} strokeWidth={1.5} />
    <path d="M6 7V4.5M12 7V3.5M18 7V4.5" {...S} strokeWidth={1.75} />
    <circle cx="6" cy="3.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="3.5" r="1.1" fill="currentColor" stroke="none" />
  </NetIcon>
);

const LoadBalancerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <circle cx="12" cy="5.5" r="2.75" {...S} />
    <path d="M12 8v3.5M7.5 17l4.5-5M16.5 17l-4.5-5" {...S} />
    <rect x="3.5" y="17" width="5.5" height="4" rx="1" {...S} />
    <rect x="15" y="17" width="5.5" height="4" rx="1" {...S} />
    <rect x="9.25" y="17" width="5.5" height="4" rx="1" {...S} />
  </NetIcon>
);

/** Concentrador BNG — tráfego convergindo para hub central. */
const VpnIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="8.5" y="9" width="7" height="7" rx="1.5" {...S} />
    <path d="M12 9V6.5M12 16v2.5M12 6.5V4" {...S} />
    <path d="M8.5 12.5H5M15.5 12.5H19M10.5 9L6.5 5.5M13.5 9l4-3.5M10.5 16l-3.5 3.5M13.5 16l3.5 3.5" {...S} strokeWidth={1.75} />
    <circle cx="12" cy="12.5" r="1.25" fill="currentColor" stroke="none" />
  </NetIcon>
);

const OnuIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="5.5" y="10" width="13" height="7.5" rx="1.5" {...S} />
    <path d="M9 13.5h6" {...S} strokeWidth={1.5} />
    <circle cx="12" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
    <path d="M12 10V6.5" {...S} />
    <path d="M9.5 6.5h5" {...S} />
    <circle cx="12" cy="4.5" r="1.75" {...S} />
  </NetIcon>
);

const FiberIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M3 12c2.5-3.5 5-3.5 7.5 0s5 3.5 7.5 0 5-3.5 7.5 0" {...S} />
    <circle cx="12" cy="7" r="2.25" {...S} />
    <path d="M12 4.75V3M9.5 7.5L8 6M14.5 7.5L16 6" {...S} strokeWidth={1.5} />
  </NetIcon>
);

const RadioIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M12 21V10" {...S} />
    <path d="M8.5 21h7" {...S} />
    <path d="M7.5 10h9" {...S} />
    <path d="M9.5 10V6.5l2.5-3.5 2.5 3.5V10" {...S} />
    <path d="M5.5 8l2 2M18.5 8l-2 2" {...S} strokeWidth={1.75} />
  </NetIcon>
);

const TowerIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <path d="M12 3l-3.5 18h7L12 3z" {...S} />
    <path d="M9 13h6M9.5 17h5" {...S} strokeWidth={1.5} />
    <path d="M6.5 21h11" {...S} />
    <circle cx="12" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
  </NetIcon>
);

const SatelliteIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="7.5" y="7.5" width="9" height="5.5" rx="1" {...S} />
    <path d="M5 10H7.5M16.5 10H19M5 13H7.5M16.5 13H19" {...S} strokeWidth={1.5} />
    <path d="M12 13v3.5M9.5 16.5h5M10 19.5h4" {...S} />
    <path d="M3.5 18.5c2.5-1 5-1 7.5 0M13 18.5c2.5-1 5-1 7.5 0" {...S} strokeWidth={1.5} />
  </NetIcon>
);

const MeshIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <circle cx="5.5" cy="17.5" r="2.5" {...S} />
    <circle cx="18.5" cy="17.5" r="2.5" {...S} />
    <circle cx="12" cy="6.5" r="2.5" {...S} />
    <path d="M7.5 15.5L10.5 9M16.5 15.5L13.5 9M8 17.5h8" {...S} />
  </NetIcon>
);

const RackIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <rect x="5.5" y="1.5" width="13" height="21" rx="1.5" {...S} />
    <path d="M7.5 5.5h10M7.5 9h10M7.5 12.5h10M7.5 16h10M7.5 19.5h10" {...S} strokeWidth={1.25} />
    <circle cx="8.75" cy="5.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="8.75" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="8.75" cy="19.5" r="0.7" fill="currentColor" stroke="none" />
  </NetIcon>
);

const DnsIcon: FC<NetIconProps> = (props) => (
  <NetIcon {...props}>
    <circle cx="12" cy="12" r="8.5" {...S} />
    <path d="M3.5 12h17M12 3.5a12.5 12.5 0 010 17M12 3.5a12.5 12.5 0 000 17" {...S} strokeWidth={1.5} />
    <path d="M8.5 9h7M8.5 12h5M8.5 15h6" {...S} strokeWidth={1.75} />
  </NetIcon>
);

type NetworkIconComponent = FC<NetIconProps>;

export const NETWORK_ICON_COMPONENTS: Partial<Record<TopologyHostIcon, NetworkIconComponent>> = {
  bras: BrasIcon,
  load_balancer: LoadBalancerIcon,
  vpn: VpnIcon,
  onu: OnuIcon,
  fiber: FiberIcon,
  radio: RadioIcon,
  tower: TowerIcon,
  satellite: SatelliteIcon,
  mesh: MeshIcon,
  rack: RackIcon,
  dns: DnsIcon,
};

export function isNetworkHostIcon(icon: TopologyHostIcon): boolean {
  return icon in NETWORK_ICON_COMPONENTS;
}
