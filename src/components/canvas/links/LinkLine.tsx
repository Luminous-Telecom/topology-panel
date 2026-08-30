import React, { useState } from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkEndpointRuntimeMetrics, LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../../types';
import { formatLinkBandwidth, linkStrokeWidth } from '../../../utils/linkBandwidth';
import { LINK_FLOW_DASH, supportsFlowArrows } from '../../../utils/linkFlow';
import {
  computeFlowSpeed,
  resolveFlowLaneSpeed,
  resolveLinkUtilizationLevel,
} from '../../../utils/linkFlowSpeed';
import {
  isLinkVisuallyDown,
  linkRuntimeColor,
  utilizationThresholdsFromOptions,
  resolveLinkMapTrafficMetrics,
} from '../../../utils/linkMetricsRuntime';
import { linkKey } from '../../../utils/mapLinkEdits';
import { resolvePanelColor } from '../../../utils/panelColors';
import {
  buildLinkPathD,
  computeLinkGeometry,
  LinkPoint,
  offsetPolyline,
  pointAlongPolyline,
  polylineLength,
} from '../../../utils/linkGeometry';
import { resolveLinkMedium } from '../../../utils/linkMedium';
import { formatBitsPerSecond } from '../../../utils/zabbixAdapter/formatTraffic';
import { buildLinkHoverTooltip } from '../../../utils/linkHoverTooltip';
import { NodeLayout } from '../../../utils/nodeLayout';
import { canvasStyles } from '../canvasStyles';
import { LinkHoverPopover } from '../../LinkHoverPopover';
import { LinkFlowArrows } from './LinkFlowArrows';
import { LinkTrafficLabel } from './LinkTrafficLabel';
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
  const displayTraffic = resolveLinkMapTrafficMetrics(link, runtimeMetrics);
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
    status: runtimeMetrics?.status,
  });
  const thresholds = utilizationThresholdsFromOptions(options);
  const utilLevel = resolveLinkUtilizationLevel(runtimeMetrics, thresholds);
  const interfaceDown = runtimeMetrics?.status === 'down';
  const uploadOffline = interfaceDown || fromHostOffline;
  const downloadOffline = interfaceDown || toHostOffline;
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
  const downloadSpeed = resolveFlowLaneSpeed(
    displayTraffic.rxBps,
    displayTraffic.rxUtilizationPct,
    runtimeMetrics,
    thresholds
  );
  const uploadSpeed = resolveFlowLaneSpeed(
    displayTraffic.txBps,
    displayTraffic.txUtilizationPct,
    runtimeMetrics,
    thresholds
  );
  const hasMetricBinding = Boolean(link.fromInterface?.metrics || link.toInterface?.metrics);
  const downloadFlowActive = !downloadOffline && (hasMetricBinding ? downloadSpeed > 0 : true);
  const uploadFlowActive = !uploadOffline && (hasMetricBinding ? uploadSpeed > 0 : true);
  const lk = linkKey(link);
  const downloadFlowSpeed = hasMetricBinding
    ? downloadSpeed
    : computeFlowSpeed(runtimeMetrics, thresholds) * 0.5;
  const uploadFlowSpeed = hasMetricBinding
    ? uploadSpeed
    : computeFlowSpeed(runtimeMetrics, thresholds) * 0.5;
  const reverseD = buildLinkPathD([...pathPoints].reverse(), gridStep, hasWaypoints, -bundleOffset);
  const laneLength = polylineLength(drawnPoints);
  const pulseSize = Math.max(4, strokeWidth * 1.8);
  const trafficAnchor = pointAlongPolyline(drawnPoints, 0.5);

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
        <g>
          {!uploadOffline && (
            <LinkFlowArrows
              laneD={d}
              laneLength={laneLength}
              color={uploadLabelColor}
              direction="upload"
              linkId={lk}
              speed={uploadFlowSpeed}
              active={uploadFlowActive}
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
              speed={downloadFlowSpeed}
              active={downloadFlowActive}
              size={pulseSize}
            />
          )}
        </g>
      ) : (
        <>
          <path
            d={d}
            data-link-flow="download"
            data-link-key={lk}
            data-link-flow-speed={String(downloadFlowSpeed)}
            data-link-flow-active={downloadFlowActive ? 'true' : 'false'}
            stroke={downloadLabelColor}
            strokeWidth={Math.max(2.4, strokeWidth)}
            strokeDasharray={LINK_FLOW_DASH}
            fill="none"
            pointerEvents="none"
            opacity={0.95}
            {...LINK_LINE_CAP}
          />
          <path
            d={d}
            data-link-flow="upload"
            data-link-key={lk}
            data-link-flow-speed={String(uploadFlowSpeed)}
            data-link-flow-active={uploadFlowActive ? 'true' : 'false'}
            stroke={uploadLabelColor}
            strokeWidth={Math.max(2.4, strokeWidth)}
            strokeDasharray={LINK_FLOW_DASH}
            fill="none"
            pointerEvents="none"
            opacity={0.95}
            {...LINK_LINE_CAP}
          />
        </>
      )}
      {txLabel || rxLabel ? (
        <LinkTrafficLabel
          x={trafficAnchor.x}
          y={trafficAnchor.y}
          txLabel={txLabel}
          rxLabel={rxLabel}
          uploadColor={uploadLabelColor}
          downloadColor={downloadLabelColor}
        />
      ) : null}
    </g>
  );
}

/**
 * `lastclock` do Zabbix muda a cada coleta mesmo com o mesmo lastvalue. Comparar só o que o cabo
 * desenha (bps, utilização, status, sinal) evita redesenhar todos os links no poll.
 */
function sameEndpointVisual(prev: LinkEndpointRuntimeMetrics, next: LinkEndpointRuntimeMetrics): boolean {
  return (
    prev.rxBps === next.rxBps &&
    prev.txBps === next.txBps &&
    prev.rxUtilizationPct === next.rxUtilizationPct &&
    prev.txUtilizationPct === next.txUtilizationPct &&
    prev.operStatus === next.operStatus &&
    prev.capacityMbps === next.capacityMbps &&
    prev.errors === next.errors &&
    prev.drops === next.drops &&
    prev.rxPowerDbm === next.rxPowerDbm &&
    prev.txPowerDbm === next.txPowerDbm
  );
}

function sameRuntimeVisual(prev?: LinkRuntimeMetrics, next?: LinkRuntimeMetrics): boolean {
  if (prev === next) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }
  return prev.status === next.status && sameEndpointVisual(prev.from, next.from) && sameEndpointVisual(prev.to, next.to);
}

/** Comparação ponto a ponto — a lista é pequena e roda para cada cabo em cada frame de pan. */
function sameWaypoints(prev: LinkPoint[], next: LinkPoint[]): boolean {
  if (prev === next) {
    return true;
  }
  if (prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i].x !== next[i].x || prev[i].y !== next[i].y) {
      return false;
    }
  }
  return true;
}

/**
 * Só redesenha quando algo que o link realmente usa muda: estado visual, endpoints, waypoints,
 * caixa dos dois nós e as opções de cor/espessura. Sem isso, arrastar um nó redesenha todos os
 * links do mapa.
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
  if (prev.runtimeMetrics !== next.runtimeMetrics && !sameRuntimeVisual(prev.runtimeMetrics, next.runtimeMetrics)) {
    return false;
  }
  if (prev.fromHostOffline !== next.fromHostOffline || prev.toHostOffline !== next.toHostOffline) {
    return false;
  }
  if (prev.bundleOffset !== next.bundleOffset) {
    return false;
  }
  if (!sameWaypoints(prev.waypoints, next.waypoints)) {
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
