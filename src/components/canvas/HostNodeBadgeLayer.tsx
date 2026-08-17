import React from 'react';
import { HostNodeBadge } from '../../utils/noc/types';

interface Props {
  badges: HostNodeBadge[];
  x: number;
  y: number;
  width: number;
}

/** Badge compacto no canto superior direito do nó — não polui o mapa. */
export function HostNodeBadgeLayer({ badges, x, y, width }: Props) {
  if (!badges.length) {
    return null;
  }

  return (
    <g pointerEvents="none">
      {badges.map((badge, index) => {
        const offsetX = width - 6 - index * 22;
        const pillW = Math.max(18, badge.label.length * 6 + 10);
        return (
          <g key={`${badge.kind}-${index}`} transform={`translate(${x + offsetX - pillW}, ${y + 4})`}>
            <rect
              x={0}
              y={0}
              width={pillW}
              height={14}
              rx={7}
              fill={badge.color}
              stroke="rgba(255,255,255,0.65)"
              strokeWidth={0.75}
            />
            <text
              x={pillW / 2}
              y={7}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize={9}
              fontWeight={600}
              fontFamily="Inter, Helvetica, Arial, sans-serif"
            >
              {badge.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
