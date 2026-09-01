import React, { MutableRefObject, useState } from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../../types';
import { formatLinkBandwidth, linkStrokeWidth } from '../../../utils/linkBandwidth';
import { LINK_FLOW_DASH, supportsFlowArrows } from '../../../utils/linkFlow';
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
  polylineLength,
  sameLinkPoints,
} from '../../../utils/linkGeometry';
import { resolveLinkMedium } from '../../../utils/linkMedium';
import { formatBitsPerSecond } from '../../../utils/zabbixAdapter/formatTraffic';
import { buildLinkHoverTooltip } from '../../../utils/linkHoverTooltip';
import { NodeLayout } from '../../../utils/nodeLayout';
import { canvasStyles } from '../canvasStyles';
import { LinkHoverPopover } from '../../LinkHoverPopover';
import { LinkFlowArrows } from './LinkFlowArrows';
import {
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
  /** Lastvalue vivo — o memo do cabo ignora bps; o tooltip lê daqui no hover. */
  metricsLiveRef?: MutableRefObject<Record<string, LinkRuntimeMetrics>>;
  fromHostOffline?: boolean;
  toHostOffline?: boolean;
  onSelect: () => void;
  onHoverChange: (active: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPathPointerDown: (e: React.PointerEvent) => void;
  onPathDoubleClick: (e: React.MouseEvent) => void;
}

function linkMarkerSuffix(
  linkDown: boolean,
  level: ReturnType<typeof resolveLinkUtilizationLevel>
): string | undefined {
  if (linkDown) {
    return 'offline';
  }
  switch (level) {
    case 'attention':
      return 'attention';
    case 'high':
      return 'high';
    case 'critical':
      return 'congested';
    default:
      return undefined;
  }
}

function resolveLinkStrokeColor(args: {
  linkDown: boolean;
  selected: boolean;
  hovered: boolean;
  utilLevel: ReturnType<typeof resolveLinkUtilizationLevel>;
  runtimeColor: string;
  linkColor: string;
}): string {
  if (args.linkDown) {
    return args.runtimeColor;
  }
  if (args.selected) {
    return LINK_SELECT_COLOR;
  }
  if (args.hovered) {
    return LINK_HOVER_COLOR;
  }
  if (args.utilLevel !== 'normal') {
    return args.runtimeColor;
  }
  return args.linkColor;
}

function linkMarkerUrl(
  kind: 'start' | 'end',
  selected: boolean,
  hovered: boolean,
  markerLevel: string | undefined,
  linkDown: boolean
): string {
  const prefix = kind === 'start' ? 'link-dot-start' : 'link-dot-end';
  if (!linkDown && selected) {
    return `url(#${prefix}-active)`;
  }
  if (!linkDown && hovered) {
    return `url(#${prefix}-hover)`;
  }
  if (markerLevel) {
    return `url(#${prefix}-${markerLevel})`;
  }
  return `url(#${prefix})`;
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
  metricsLiveRef,
  fromHostOffline = false,
  toHostOffline = false,
  onSelect,
  onHoverChange,
  onContextMenu,
  onPathPointerDown,
  onPathDoubleClick,
}: LinkLineProps) {
  const theme = useTheme2();
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const thresholds = utilizationThresholdsFromOptions(options);
  const lk = linkKey(link);
  const liveMetrics = metricsLiveRef?.current[lk] ?? runtimeMetrics;
  const displayTraffic = resolveLinkMapTrafficMetrics(link, liveMetrics);
  const interfaceDown = runtimeMetrics?.status === 'down';
  const uploadOffline = interfaceDown || fromHostOffline;
  const downloadOffline = interfaceDown || toHostOffline;
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
  const hitWidth = Math.max(10, linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, false, false) + 8);
  const medium = resolveLinkMedium(link);
  const dashArray = medium === 'radio' ? LINK_RADIO_DASH : undefined;
  const strokeWidth = linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, selected, hovered);
  const bandwidthLabel = formatLinkBandwidth(link.bandwidthMbps ?? displayTraffic.capacityMbps);
  const fromName = link.fromInterface?.name;
  const toName = link.toInterface?.name;
  const txLabel = formatBitsPerSecond(displayTraffic.txBps);
  const rxLabel = formatBitsPerSecond(displayTraffic.rxBps);
  const drawnPoints = bundleOffset === 0 ? pathPoints : offsetPolyline(pathPoints, bundleOffset);
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
  const markerLevel = linkMarkerSuffix(linkDown, utilLevel);
  const linkColor = resolvePanelColor(theme, options.colorLink);
  const strokeColor = resolveLinkStrokeColor({
    linkDown,
    selected,
    hovered,
    utilLevel,
    runtimeColor,
    linkColor,
  });
  const markerStart = linkMarkerUrl('start', selected, hovered, markerLevel, linkDown);
  const markerEnd = linkMarkerUrl('end', selected, hovered, markerLevel, linkDown);
  const downloadLabelColor = resolvePanelColor(theme, options.colorLinkDownload);
  const uploadLabelColor = resolvePanelColor(theme, options.colorLinkUpload);
  const reverseD = buildLinkPathD([...pathPoints].reverse(), gridStep, hasWaypoints, -bundleOffset);
  const laneLength = polylineLength(drawnPoints);
  const pulseSize = Math.max(4, strokeWidth * 1.8);

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
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={1}
        strokeDasharray={dashArray}
        markerStart={markerStart}
        markerEnd={markerEnd}
        fill="none"
        pointerEvents="none"
        {...LINK_LINE_CAP}
      />
      {supportsFlowArrows ? (
        <>
          {!uploadOffline && (
            <LinkFlowArrows
              laneD={d}
              laneLength={laneLength}
              color={uploadLabelColor}
              direction="upload"
              linkId={lk}
              size={pulseSize}
            />
          )}
          {!downloadOffline && (
            <LinkFlowArrows
              laneD={reverseD}
              laneLength={laneLength}
              color={downloadLabelColor}
              direction="download"
              linkId={lk}
              size={pulseSize}
            />
          )}
        </>
      ) : (
        <>
          {!downloadOffline && (
            <path
              d={d}
              data-link-flow="download"
              data-link-key={lk}
              stroke={downloadLabelColor}
              strokeWidth={Math.max(2.4, strokeWidth)}
              strokeDasharray={LINK_FLOW_DASH}
              fill="none"
              pointerEvents="none"
              opacity={0.95}
              {...LINK_LINE_CAP}
            />
          )}
          {!uploadOffline && (
            <path
              d={d}
              data-link-flow="upload"
              data-link-key={lk}
              stroke={uploadLabelColor}
              strokeWidth={Math.max(2.4, strokeWidth)}
              strokeDasharray={LINK_FLOW_DASH}
              fill="none"
              pointerEvents="none"
              opacity={0.95}
              {...LINK_LINE_CAP}
            />
          )}
        </>
      )}
    </g>
  );
}

/**
 * Só redesenha o path/pulsos quando a pintura muda (faixa de utilização, status, geometria).
 * Bps cru atualiza a pílula em `LinkTrafficOverlay` e o tooltip via `metricsLiveRef`.
 */
export const LinkLine = React.memo(LinkLineComponent, (prev, next) => {
  if (
    prev.selected !== next.selected ||
    prev.hovered !== next.hovered
  ) {
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
  return (
    prev.options.colorLink === next.options.colorLink &&
    prev.options.colorOffline === next.options.colorOffline &&
    prev.options.colorLinkDownload === next.options.colorLinkDownload &&
    prev.options.colorLinkUpload === next.options.colorLinkUpload &&
    prev.options.colorLinkWidth === next.options.colorLinkWidth &&
    prev.options.gridSize === next.options.gridSize &&
    prev.options.colorLinkCongestion === next.options.colorLinkCongestion &&
    prev.options.colorLinkAttention === next.options.colorLinkAttention &&
    prev.options.colorLinkHigh === next.options.colorLinkHigh &&
    prev.options.linkUtilThresholdAttention === next.options.linkUtilThresholdAttention &&
    prev.options.linkUtilThresholdHigh === next.options.linkUtilThresholdHigh &&
    prev.options.linkUtilThresholdCritical === next.options.linkUtilThresholdCritical
  );
});
