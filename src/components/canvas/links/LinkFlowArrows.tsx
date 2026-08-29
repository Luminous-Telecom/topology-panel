import React from 'react';
import { LINK_FLOW_ARROW_MAX, LINK_FLOW_ARROW_SPACING } from './linkLineVisual';

interface FlowArrowsProps {
  laneD: string;
  laneLength: number;
  color: string;
  direction: 'upload' | 'download';
  linkId: string;
  speed: number;
  active: boolean;
  size: number;
}

/**
 * Pulsos que **correm com o tráfego**: cada círculo anda pelo cabo via `offset-path`.
 * Sem tráfego a animação para e os pulsos ficam parados.
 */
function LinkFlowArrowsComponent({
  laneD,
  laneLength,
  color,
  direction,
  linkId,
  speed,
  active,
  size,
}: FlowArrowsProps) {
  const count = Math.min(LINK_FLOW_ARROW_MAX, Math.floor(laneLength / LINK_FLOW_ARROW_SPACING));
  if (count < 1) {
    return null;
  }
  const step = laneLength / count;
  const coreR = Math.max(1.6, size * 0.38);
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <circle
          key={index}
          r={coreR}
          cx={0}
          cy={0}
          data-link-flow={direction}
          data-link-flow-arrow="true"
          data-link-key={linkId}
          data-link-flow-speed={String(speed)}
          data-link-flow-active={active ? 'true' : 'false'}
          data-link-flow-length={String(laneLength)}
          data-link-flow-phase={String(index * step)}
          fill={color}
          stroke={color}
          strokeWidth={coreR * 1.6}
          strokeOpacity={0.35}
          pointerEvents="none"
          style={{
            // A posição (`offset-distance`) é do laço em `linkFlow.ts`. Se o React gravar 0px
            // aqui, cada poll de tráfego zera os pulsos e o cabo parece travado.
            offsetPath: `path('${laneD}')`,
            offsetRotate: '0deg',
          }}
        />
      ))}
    </>
  );
}

export const LinkFlowArrows = React.memo(LinkFlowArrowsComponent);
