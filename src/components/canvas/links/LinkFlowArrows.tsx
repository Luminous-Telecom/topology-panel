import React, { useLayoutEffect, useRef } from 'react';
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

type FlowGlyphsProps = Omit<FlowArrowsProps, 'speed' | 'active'>;

/**
 * Glifos estáveis: velocidade e ativo entram por atributo no layout, sem reconciliar o `<circle>`.
 * Regravar `fill`/`offset-path` no poll faz o Chrome zerar `offset-distance`.
 */
const LinkFlowGlyphs = React.memo(function LinkFlowGlyphs({
  laneD,
  laneLength,
  color,
  direction,
  linkId,
  size,
}: FlowGlyphsProps) {
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
          data-link-flow-speed="0"
          data-link-flow-active="false"
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
});

/**
 * Pulsos que **correm com o tráfego**: cada círculo anda pelo cabo via `offset-path`.
 * O path e a distância ficam no laço (`linkFlow.ts`) — o React não escreve `style`, senão cada
 * poll regrava `offset-path` e o Chrome zera os pulsos.
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
  const groupRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) {
      return;
    }
    const speedStr = String(speed);
    const activeStr = active ? 'true' : 'false';
    for (const el of Array.from(root.querySelectorAll('[data-link-flow-arrow]'))) {
      el.setAttribute('data-link-flow-speed', speedStr);
      el.setAttribute('data-link-flow-active', activeStr);
    }
  }, [speed, active]);

  return (
    <g ref={groupRef}>
      <LinkFlowGlyphs
        laneD={laneD}
        laneLength={laneLength}
        color={color}
        direction={direction}
        linkId={linkId}
        size={size}
      />
    </g>
  );
}

export const LinkFlowArrows = React.memo(LinkFlowArrowsComponent);
