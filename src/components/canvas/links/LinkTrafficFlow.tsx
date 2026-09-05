import React from 'react';
import { flowDashPeriod, trafficFlowStep } from '../../../utils/linkAnimationStyle';
import { LINK_LINE_CAP, LINK_TRAFFIC_DASH, LINK_TRAFFIC_WIDTH } from './linkLineVisual';

interface LinkTrafficFlowProps {
  d: string;
  color: string;
  linkId: string;
  speed: number;
}

/** Traço amarelo animado sobre a linha fina do cabo (loop rAF via `data-link-flow`). */
function LinkTrafficFlowComponent({ d, color, linkId, speed }: LinkTrafficFlowProps) {
  const period = flowDashPeriod(LINK_TRAFFIC_DASH);
  const step = trafficFlowStep(speed);
  return (
    <path
      d={d}
      data-link-flow="upload"
      data-link-key={linkId}
      data-link-flow-period={String(period)}
      data-link-flow-step={String(step)}
      stroke={color}
      strokeWidth={LINK_TRAFFIC_WIDTH}
      strokeDasharray={LINK_TRAFFIC_DASH}
      fill="none"
      pointerEvents="none"
      opacity={0.95}
      {...LINK_LINE_CAP}
    />
  );
}

export const LinkTrafficFlow = React.memo(LinkTrafficFlowComponent);
