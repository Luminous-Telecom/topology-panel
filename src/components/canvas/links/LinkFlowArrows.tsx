import React from 'react';
import { LINK_FLOW_ARROW_MAX, LINK_FLOW_ARROW_SPACING } from './linkLineVisual';

interface FlowArrowsProps {
  laneD: string;
  laneLength: number;
  color: string;
  direction: 'upload' | 'download';
  linkId: string;
  size: number;
}

/**
 * Pulsos que correm no cabo via `offset-path`. A velocidade é constante (`LINK_FLOW_SPEED`); o
 * React não escreve `style` nem atributo de velocidade — no Chrome isso zera `offset-distance`.
 */
function LinkFlowArrowsComponent({
  laneD,
  laneLength,
  color,
  direction,
  linkId,
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
          data-link-flow-length={String(laneLength)}
          data-link-flow-phase={String(index * step)}
          data-link-flow-path={laneD}
          fill={color}
          stroke={color}
          strokeWidth={coreR * 1.6}
          strokeOpacity={0.35}
          pointerEvents="none"
        />
      ))}
    </>
  );
}

export const LinkFlowArrows = React.memo(LinkFlowArrowsComponent);
