import React from 'react';
import { LINK_FLOW_ARROW_MAX, LINK_FLOW_ARROW_SPACING, LINK_OUTLINE_COLOR } from './linkLineVisual';

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
 * Setas que **correm com o tráfego**: cada glifo anda pelo canal via `offset-path`, girado na
 * tangente do cabo. Sem tráfego a animação para e as setas ficam paradas.
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
  const half = size / 2;
  const glyph = `M ${-half} ${-size * 0.6} L ${half * 1.2} 0 L ${-half} ${size * 0.6}`;
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <path
          key={index}
          d={glyph}
          data-link-flow={direction}
          data-link-flow-arrow="true"
          data-link-key={linkId}
          data-link-flow-speed={String(speed)}
          data-link-flow-active={active ? 'true' : 'false'}
          data-link-flow-length={String(laneLength)}
          data-link-flow-phase={String(index * step)}
          fill={color}
          stroke={LINK_OUTLINE_COLOR}
          strokeWidth={0.5}
          strokeLinejoin="round"
          pointerEvents="none"
          style={{
            // A posição (`offset-distance`) é do laço em `linkFlow.ts`. Se o React gravar 0px
            // aqui, cada poll de tráfego zera as setas e o cabo parece travado.
            offsetPath: `path('${laneD}')`,
            offsetRotate: 'auto',
          }}
        />
      ))}
    </>
  );
}

export const LinkFlowArrows = React.memo(LinkFlowArrowsComponent);
