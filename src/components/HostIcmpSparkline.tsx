import React, { useMemo } from 'react';
import type { IcmpHistoryPoint } from '../utils/icmpHistorySeries';

const WIDTH = 248;
const HEIGHT = 36;

interface Props {
  points: readonly IcmpHistoryPoint[];
  color: string;
  label: string;
}

/** Sparkline SVG do hover — pontos já recortados, sem lib de gráfico. */
export function HostIcmpSparkline({ points, color, label }: Props) {
  const path = useMemo(() => {
    if (points.length < 2) {
      return undefined;
    }
    let min = points[0]!.value;
    let max = min;
    for (const point of points) {
      if (point.value < min) {
        min = point.value;
      }
      if (point.value > max) {
        max = point.value;
      }
    }
    const span = max - min || 1;
    const last = points.length - 1;
    return points
      .map((point, index) => {
        const x = (index / last) * WIDTH;
        const y = HEIGHT - ((point.value - min) / span) * (HEIGHT - 6) - 3;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  if (!path) {
    return null;
  }

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden>
      <title>{label}</title>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
