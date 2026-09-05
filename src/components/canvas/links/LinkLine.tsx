import React, { useState } from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../../types';
import { formatLinkBandwidth } from '../../../utils/linkBandwidth';
import { normalizeLinkAnimationSpeed } from '../../../utils/linkAnimationStyle';
import { resolveLinkUtilizationLevel } from '../../../utils/linkFlowSpeed';
import {
  isLinkVisuallyDown,
  linkRuntimeColor,
  utilizationThresholdsFromOptions,
  resolveLinkMapTrafficMetrics,
  sameLinkLinePaint,
} from '../../../utils/linkMetricsRuntime';
import { linkKey } from '../../../utils/mapLinkEdits';
import { resolvePanelColor } from '../../../utils/panelColors';
import {
  buildLinkPathD,
  computeLinkGeometry,
  LinkPoint,
  offsetPolyline,
  sameLinkPoints,
} from '../../../utils/linkGeometry';
import { resolveLinkMedium } from '../../../utils/linkMedium';
import { formatBitsPerSecond } from '../../../utils/zabbixAdapter/formatTraffic';
import { buildLinkHoverTooltip } from '../../../utils/linkHoverTooltip';
import { useLinkMetricsLiveStore } from '../../../hooks/linkMetricsLiveStore';
import { NodeLayout } from '../../../utils/nodeLayout';
import { canvasStyles } from '../canvasStyles';
import { LinkHoverPopover } from '../../LinkHoverPopover';
import { LinkTrafficFlow } from './LinkTrafficFlow';
import {
  LINK_BASE_OPACITY,
  LINK_BASE_WIDTH,
  LINK_HOVER_COLOR,
  LINK_LINE_CAP,
  LINK_RADIO_DASH,
  LINK_SELECT_COLOR,
} from './linkLineVisual';

interface LinkLineProps {
  link: TopologyLink;
  waypoints: LinkPoint[];
  bundleOffset?: number;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  selected: boolean;
  hovered: boolean;
  runtimeMetrics?: LinkRuntimeMetrics;
  fromHostOffline?: boolean;
  toHostOffline?: boolean;
  onSelect: () => void;
  onHoverChange: (active: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPathPointerDown: (e: React.PointerEvent) => void;
  onPathDoubleClick: (e: React.MouseEvent) => void;
  flowAnimate?: boolean;
}

function resolveBaseStrokeWidth(selected: boolean, hovered: boolean): number {
  if (selected) {
    return LINK_BASE_WIDTH + 0.75;
  }
  if (hovered) {
    return LINK_BASE_WIDTH + 0.35;
  }
  return LINK_BASE_WIDTH;
}

function resolveBaseStrokeColor(args: {
  linkDown: boolean;
  selected: boolean;
  hovered: boolean;
  utilLevel: ReturnType<typeof resolveLinkUtilizationLevel>;
  runtimeColor: string;
  linkColor: string;
}): { color: string; opacity: number } {
  if (args.linkDown) {
    return { color: args.runtimeColor, opacity: 1 };
  }
  if (args.selected) {
    return { color: LINK_SELECT_COLOR, opacity: 1 };
  }
  if (args.hovered) {
    return { color: LINK_HOVER_COLOR, opacity: 1 };
  }
  if (args.utilLevel !== 'normal') {
    return { color: args.runtimeColor, opacity: 1 };
  }
  return { color: args.linkColor, opacity: LINK_BASE_OPACITY };
}

function LinkLineComponent({
  link,
  waypoints,
  bundleOffset = 0,
  nodeLayouts,
  options,
  selected,
  hovered,
  runtimeMetrics,
  fromHostOffline = false,
  toHostOffline = false,
  onSelect,
  onHoverChange,
  onContextMenu,
  onPathPointerDown,
  onPathDoubleClick,
  flowAnimate = true,
}: LinkLineProps) {
  const theme = useTheme2();
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const linkMetricsStore = useLinkMetricsLiveStore();
  const thresholds = utilizationThresholdsFromOptions(options);
  const lk = linkKey(link);
  const liveMetrics = linkMetricsStore.getLive()[lk] ?? runtimeMetrics;
  const displayTraffic = resolveLinkMapTrafficMetrics(link, liveMetrics);
  const interfaceDown = runtimeMetrics?.status === 'down';
  const from = nodeLayouts.get(link.from);
  const to = nodeLayouts.get(link.to);
  if (!from || !to) {
    return null;
  }
  const gridStep = options.gridSize ?? 10;
  const geom = computeLinkGeometry(from, to, gridStep, waypoints);
  const { pathPoints } = geom;
  const hasWaypoints = waypoints.length > 0;
  const d = buildLinkPathD(pathPoints, gridStep, hasWaypoints, bundleOffset);
  const strokeWidth = resolveBaseStrokeWidth(selected, hovered);
  const hitWidth = Math.max(10, strokeWidth + 8);
  const medium = resolveLinkMedium(link);
  const mediumDash = medium === 'radio' ? LINK_RADIO_DASH : undefined;
  const bandwidthLabel = formatLinkBandwidth(link.bandwidthMbps ?? displayTraffic.capacityMbps);
  const fromName = link.fromInterface?.name;
  const toName = link.toInterface?.name;
  const txLabel = formatBitsPerSecond(displayTraffic.txBps);
  const rxLabel = formatBitsPerSecond(displayTraffic.rxBps);
  const hoverTooltip = buildLinkHoverTooltip({
    fromLabel: from.label || link.from,
    toLabel: to.label || link.to,
    fromInterfaceName: fromName,
    toInterfaceName: toName,
    capacityLabel: bandwidthLabel,
    uploadLabel: txLabel,
    downloadLabel: rxLabel,
    txUtilizationPct: displayTraffic.txUtilizationPct,
    rxUtilizationPct: displayTraffic.rxUtilizationPct,
    txPowerDbm: displayTraffic.txPowerDbm,
    rxPowerDbm: displayTraffic.rxPowerDbm,
    errors: displayTraffic.errors,
    drops: displayTraffic.drops,
    status: liveMetrics?.status,
  });
  const utilLevel = resolveLinkUtilizationLevel(runtimeMetrics, thresholds);
  const linkDown = isLinkVisuallyDown(runtimeMetrics, fromHostOffline, toHostOffline);
  const runtimeColor = resolvePanelColor(
    theme,
    linkRuntimeColor(options, runtimeMetrics, utilLevel, fromHostOffline || toHostOffline)
  );
  const linkColor = resolvePanelColor(theme, options.colorLink);
  const baseStroke = resolveBaseStrokeColor({
    linkDown,
    selected,
    hovered,
    utilLevel,
    runtimeColor,
    linkColor,
  });
  const trafficColor = resolvePanelColor(theme, options.colorLinkUpload);
  const downloadLabelColor = resolvePanelColor(theme, options.colorLinkDownload);
  const uploadLabelColor = trafficColor;
  const animationSpeed = normalizeLinkAnimationSpeed(options.linkAnimationSpeed);
  const animationEnabled = options.linkAnimationEnabled !== false;
  const trafficActive =
    flowAnimate &&
    animationEnabled &&
    !linkDown &&
    !interfaceDown &&
    !fromHostOffline &&
    !toHostOffline;

  return (
    <g
      className={linkDown ? canvasStyles.offlineBlink : undefined}
      data-link-offline={linkDown ? 'true' : undefined}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => {
        onHoverChange(true);
        setHoverPoint({ x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={() => {
        onHoverChange(false);
        setHoverPoint(null);
      }}
    >
      {hoverPoint ? (
        <LinkHoverPopover
          model={hoverTooltip}
          screenX={hoverPoint.x}
          screenY={hoverPoint.y}
          uploadColor={uploadLabelColor}
          downloadColor={downloadLabelColor}
          statusColor={runtimeColor}
        />
      ) : null}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={hitWidth}
        fill="none"
        pointerEvents="stroke"
        data-link-hit="true"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPathPointerDown(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(e) => {
          onPathDoubleClick(e);
        }}
      />
      <path
        d={d}
        stroke={baseStroke.color}
        strokeWidth={strokeWidth}
        strokeOpacity={baseStroke.opacity}
        strokeDasharray={mediumDash}
        fill="none"
        pointerEvents="none"
        {...LINK_LINE_CAP}
      />
      {trafficActive ? (
        <LinkTrafficFlow d={d} color={trafficColor} linkId={lk} speed={animationSpeed} />
      ) : null}
    </g>
  );
}

export const LinkLine = React.memo(LinkLineComponent, (prev, next) => {
  if (prev.selected !== next.selected || prev.hovered !== next.hovered) {
    return false;
  }
  if (prev.link.from !== next.link.from || prev.link.to !== next.link.to) {
    return false;
  }
  if (prev.link.medium !== next.link.medium || prev.link.bandwidthMbps !== next.link.bandwidthMbps) {
    return false;
  }
  if (
    prev.link.fromInterface?.name !== next.link.fromInterface?.name ||
    prev.link.toInterface?.name !== next.link.toInterface?.name
  ) {
    return false;
  }
  if (prev.runtimeMetrics !== next.runtimeMetrics) {
    if (next.hovered) {
      return false;
    }
    const thresholds = utilizationThresholdsFromOptions(next.options);
    if (!sameLinkLinePaint(prev.runtimeMetrics, next.runtimeMetrics, thresholds)) {
      return false;
    }
  }
  if (prev.fromHostOffline !== next.fromHostOffline || prev.toHostOffline !== next.toHostOffline) {
    return false;
  }
  if (prev.bundleOffset !== next.bundleOffset) {
    return false;
  }
  if (!sameLinkPoints(prev.waypoints, next.waypoints)) {
    return false;
  }
  const pf = prev.nodeLayouts.get(prev.link.from);
  const pt = prev.nodeLayouts.get(prev.link.to);
  const nf = next.nodeLayouts.get(next.link.from);
  const nt = next.nodeLayouts.get(next.link.to);
  if (!pf || !pt || !nf || !nt) {
    return false;
  }
  if (pf.x !== nf.x || pf.y !== nf.y || pf.w !== nf.w || pf.h !== nf.h) {
    return false;
  }
  if (pt.x !== nt.x || pt.y !== nt.y || pt.w !== nt.w || pt.h !== nt.h) {
    return false;
  }
  if (
    prev.options.colorLink !== next.options.colorLink ||
    prev.options.colorOffline !== next.options.colorOffline ||
    prev.options.colorLinkDownload !== next.options.colorLinkDownload ||
    prev.options.colorLinkUpload !== next.options.colorLinkUpload ||
    prev.options.gridSize !== next.options.gridSize ||
    prev.options.colorLinkCongestion !== next.options.colorLinkCongestion ||
    prev.options.colorLinkAttention !== next.options.colorLinkAttention ||
    prev.options.colorLinkHigh !== next.options.colorLinkHigh ||
    prev.options.linkUtilThresholdAttention !== next.options.linkUtilThresholdAttention ||
    prev.options.linkUtilThresholdHigh !== next.options.linkUtilThresholdHigh ||
    prev.options.linkUtilThresholdCritical !== next.options.linkUtilThresholdCritical ||
    prev.options.linkAnimationEnabled !== next.options.linkAnimationEnabled ||
    prev.options.linkAnimationSpeed !== next.options.linkAnimationSpeed ||
    prev.flowAnimate !== next.flowAnimate
  ) {
    return false;
  }
  return true;
});
