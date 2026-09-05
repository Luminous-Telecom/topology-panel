import React from 'react';
import {
  flowDashPeriod,
  linkFlowPulseCount,
  normalizeLinkAnimationEffect,
  type LinkAnimationEffect,
} from '../../../utils/linkAnimationStyle';
import { supportsFlowArrows } from '../../../utils/linkFlow';
import {
  LINK_CAPSULE_DASH,
  LINK_COMET_DASH,
  LINK_FLOW_PULSE_RADIUS,
  LINK_LINE_CAP,
  LINK_TRAFFIC_DASH,
  LINK_TRAFFIC_WIDTH,
} from './linkLineVisual';

interface LinkTrafficFlowProps {
  d: string;
  reverseD: string;
  length: number;
  uploadColor: string;
  downloadColor: string;
  linkId: string;
  effect?: LinkAnimationEffect;
}

function FlowDash({
  d,
  color,
  direction,
  linkId,
  dasharray,
  width = LINK_TRAFFIC_WIDTH,
  opacity = 0.95,
}: {
  d: string;
  color: string;
  direction: 'upload' | 'download';
  linkId: string;
  dasharray: string;
  width?: number;
  opacity?: number;
}) {
  const period = flowDashPeriod(dasharray);
  return (
    <path
      d={d}
      data-link-flow={direction}
      data-link-key={linkId}
      data-link-flow-period={String(period)}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dasharray}
      fill="none"
      pointerEvents="none"
      opacity={opacity}
      {...LINK_LINE_CAP}
    />
  );
}

function FlowMarkers({
  d,
  length,
  color,
  direction,
  linkId,
  kind,
}: {
  d: string;
  length: number;
  color: string;
  direction: 'upload' | 'download';
  linkId: string;
  kind: 'pulses' | 'arrows';
}) {
  const count = linkFlowPulseCount(length);
  if (count <= 0) {
    return null;
  }
  const markers = [];
  for (let i = 0; i < count; i += 1) {
    const shared = {
      key: `${kind}-${direction}-${i}`,
      pointerEvents: 'none' as const,
      fill: color,
      'data-link-flow': direction,
      'data-link-flow-arrow': 'true',
      'data-link-flow-path': d,
      'data-link-flow-length': String(length),
      'data-link-flow-phase': String((length * i) / count),
      'data-link-key': linkId,
    };
    if (kind === 'arrows') {
      markers.push(
        <polygon
          {...shared}
          points="-4,-3.2 6,0 -4,3.2"
          data-link-flow-rotate="auto"
        />
      );
    } else {
      markers.push(<circle {...shared} r={LINK_FLOW_PULSE_RADIUS} cx={0} cy={0} />);
    }
  }
  return <>{markers}</>;
}

function markerEffect(effect: LinkAnimationEffect): 'pulses' | 'arrows' | undefined {
  if (effect === 'pulses' || effect === 'arrows') {
    return effect;
  }
  return undefined;
}

/** Tráfego no cabo — o visual vem de `linkAnimationEffect`. Sem `offset-path`, setas/pulsos viram traço. */
function LinkTrafficFlowComponent({
  d,
  reverseD,
  length,
  uploadColor,
  downloadColor,
  linkId,
  effect,
}: LinkTrafficFlowProps) {
  if (length <= 0) {
    return null;
  }
  const resolved = normalizeLinkAnimationEffect(effect);
  const markers = markerEffect(resolved);
  if (markers && supportsFlowArrows) {
    return (
      <g pointerEvents="none">
        <FlowMarkers
          d={d}
          length={length}
          color={uploadColor}
          direction="upload"
          linkId={linkId}
          kind={markers}
        />
        <FlowMarkers
          d={reverseD}
          length={length}
          color={downloadColor}
          direction="download"
          linkId={linkId}
          kind={markers}
        />
      </g>
    );
  }
  if (resolved === 'dualDash') {
    return (
      <g pointerEvents="none">
        <FlowDash
          d={d}
          color={uploadColor}
          direction="upload"
          linkId={linkId}
          dasharray={LINK_TRAFFIC_DASH}
        />
        <FlowDash
          d={d}
          color={downloadColor}
          direction="download"
          linkId={linkId}
          dasharray={LINK_TRAFFIC_DASH}
        />
      </g>
    );
  }
  if (resolved === 'capsules') {
    return (
      <FlowDash
        d={d}
        color={uploadColor}
        direction="upload"
        linkId={linkId}
        dasharray={LINK_CAPSULE_DASH}
      />
    );
  }
  if (resolved === 'comet') {
    return (
      <FlowDash
        d={d}
        color={uploadColor}
        direction="upload"
        linkId={linkId}
        dasharray={LINK_COMET_DASH}
        width={LINK_TRAFFIC_WIDTH + 1.2}
        opacity={0.88}
      />
    );
  }
  return (
    <FlowDash
      d={d}
      color={uploadColor}
      direction="upload"
      linkId={linkId}
      dasharray={LINK_TRAFFIC_DASH}
    />
  );
}

export const LinkTrafficFlow = React.memo(LinkTrafficFlowComponent);
