import React from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { formatLinkBandwidth, linkStrokeWidth } from '../../utils/linkBandwidth';
import { LINK_FLOW_DASH } from '../../utils/linkFlow';
import {
  computeFlowSpeed,
  resolveFlowLaneSpeed,
  resolveLinkUtilizationLevel,
} from '../../utils/linkFlowSpeed';
import {
  isLinkVisuallyDown,
  linkDegradationColor,
  linkRuntimeColor,
  utilizationThresholdsFromOptions,
  resolveLinkMapTrafficMetrics,
} from '../../utils/linkMetricsRuntime';
import { linkKey } from '../../utils/mapLinkEdits';
import { resolvePanelColor } from '../../utils/panelColors';
import { buildLinkPathD, computeLinkGeometry, linkLabelAnchor, LinkPoint, offsetPolyline } from '../../utils/linkGeometry';
import { resolveLinkMedium } from '../../utils/linkMedium';
import { formatBitsPerSecond, formatLinkMapTrafficLabel } from '../../utils/zabbixAdapter/formatTraffic';
import { NodeLayout } from '../../utils/nodeLayout';
import { canvasStyles } from './canvasStyles';

interface LinkLineProps {
  link: TopologyLink;
  waypoints: LinkPoint[];
  bundleOffset?: number;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  editable: boolean;
  panTool: boolean;
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

function LinkLineComponent({
  link,
  waypoints,
  bundleOffset = 0,
  nodeLayouts,
  options,
  editable,
  panTool,
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
  const active = selected || hovered;
  const medium = resolveLinkMedium(link);
  const dashArray = medium === 'radio' ? '10 6' : undefined;
  const strokeWidth = linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, selected, hovered);
  const laneOffset = Math.max(2, strokeWidth * 0.75);
  const downloadD = buildLinkPathD(pathPoints, gridStep, hasWaypoints, bundleOffset + laneOffset);
  const uploadD = buildLinkPathD(pathPoints, gridStep, hasWaypoints, bundleOffset - laneOffset);
  const displayTraffic = resolveLinkMapTrafficMetrics(link, runtimeMetrics);
  const bandwidthLabel = formatLinkBandwidth(link.bandwidthMbps ?? displayTraffic.capacityMbps);
  const fromName = link.fromInterface?.name;
  const toName = link.toInterface?.name;
  const txLabel = formatBitsPerSecond(displayTraffic.txBps);
  const rxLabel = formatBitsPerSecond(displayTraffic.rxBps);
  const labelText = formatLinkMapTrafficLabel(displayTraffic.txBps, displayTraffic.rxBps);
  const drawnPoints = bundleOffset === 0 ? pathPoints : offsetPolyline(pathPoints, bundleOffset);
  const mid = linkLabelAnchor(drawnPoints, from, to);
  const labelWidth = labelText ? labelText.length * 5.2 + 10 : 0;
  const labelRad = (mid.angle * Math.PI) / 180;
  const labelOffset = 9;
  const tooltipParts = [
    from?.label || link.from,
    to?.label || link.to,
    fromName && toName ? `Interfaces: ${fromName} ↔ ${toName}` : undefined,
    bandwidthLabel ? `Capacidade: ${bandwidthLabel}` : undefined,
    txLabel ? `Upload (TX): ${txLabel}` : undefined,
    rxLabel ? `Download (RX): ${rxLabel}` : undefined,
    displayTraffic.txUtilizationPct !== undefined
      ? `Util. TX: ${displayTraffic.txUtilizationPct}%`
      : undefined,
    displayTraffic.rxUtilizationPct !== undefined
      ? `Util. RX: ${displayTraffic.rxUtilizationPct}%`
      : undefined,
    runtimeMetrics?.status ? `Status: ${runtimeMetrics.status}` : undefined,
  ].filter((p): p is string => Boolean(p));
  const titleAttr = tooltipParts.length ? tooltipParts.join('\n') : undefined;
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
  const degradationColor = resolvePanelColor(theme, linkDegradationColor(options, utilLevel));
  const markerLevel = linkMarkerSuffix(linkDown, utilLevel);
  const strokeColor = linkDown
    ? runtimeColor
    : selected
      ? '#4FC3F7'
      : hovered
        ? '#81D4FA'
        : utilLevel !== 'normal'
          ? runtimeColor
          : options.colorLink;
  const lineCap = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const markerStart =
    !linkDown && selected
      ? 'url(#link-dot-start-active)'
      : !linkDown && hovered
        ? 'url(#link-dot-start-hover)'
        : markerLevel
          ? `url(#link-dot-start-${markerLevel})`
          : 'url(#link-dot-start)';
  const markerEnd =
    !linkDown && selected
      ? 'url(#link-arrow-end-active)'
      : !linkDown && hovered
        ? 'url(#link-arrow-end-hover)'
        : markerLevel
          ? `url(#link-arrow-end-${markerLevel})`
          : 'url(#link-arrow-end)';
  const downloadColor = downloadOffline
    ? runtimeColor
    : utilLevel !== 'normal'
      ? degradationColor
      : resolvePanelColor(theme, options.colorLinkDownload);
  const uploadColor = uploadOffline
    ? runtimeColor
    : utilLevel !== 'normal'
      ? degradationColor
      : resolvePanelColor(theme, options.colorLinkUpload);
  const downloadLabelColor = resolvePanelColor(theme, options.colorLinkDownload);
  const uploadLabelColor = resolvePanelColor(theme, options.colorLinkUpload);
  const flowStroke = Math.max(1.5, strokeWidth - 1);
  const downloadSpeed = resolveFlowLaneSpeed(displayTraffic.rxBps, runtimeMetrics, thresholds);
  const uploadSpeed = resolveFlowLaneSpeed(displayTraffic.txBps, runtimeMetrics, thresholds);
  const hasMetricBinding = Boolean(link.fromInterface?.metrics || link.toInterface?.metrics);
  const downloadFlowActive = !downloadOffline && (hasMetricBinding ? downloadSpeed > 0 : true);
  const uploadFlowActive = !uploadOffline && (hasMetricBinding ? uploadSpeed > 0 : true);
  const lk = linkKey(link);

  return (
    <g
      className={linkDown ? canvasStyles.offlineBlink : undefined}
      data-link-offline={linkDown ? 'true' : undefined}
      onContextMenu={editable ? onContextMenu : undefined}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {titleAttr ? <title>{titleAttr}</title> : null}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={hitWidth}
        fill="none"
        pointerEvents="stroke"
        style={{ cursor: panTool ? 'grab' : 'pointer' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPathPointerDown(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Seleção quando a mão não captura o ponteiro.
          if (!panTool && !editable) {
            onSelect();
          }
        }}
        onDoubleClick={(e) => {
          if (editable) {
            onPathDoubleClick(e);
          }
        }}
      />
      {active && (
        <path
          d={d}
          stroke="#4FC3F7"
          strokeWidth={strokeWidth + 8}
          strokeOpacity={selected ? 0.35 : 0.2}
          strokeDasharray={dashArray}
          fill="none"
          pointerEvents="none"
          {...lineCap}
        />
      )}
      <path
        d={d}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        markerStart={markerStart}
        markerEnd={markerEnd}
        fill="none"
        pointerEvents="none"
        {...lineCap}
      />
      <path
        d={downloadD}
        data-link-flow="download"
        data-link-key={lk}
        data-link-flow-speed={String(hasMetricBinding ? downloadSpeed : computeFlowSpeed(runtimeMetrics, thresholds) * 0.5)}
        data-link-flow-active={downloadFlowActive ? 'true' : 'false'}
        stroke={downloadColor}
        strokeWidth={flowStroke}
        strokeDasharray={LINK_FLOW_DASH}
        strokeDashoffset="0"
        fill="none"
        pointerEvents="none"
        opacity={selected ? 0.95 : hovered ? 0.9 : 0.82}
        {...lineCap}
      />
      <path
        d={uploadD}
        data-link-flow="upload"
        data-link-key={lk}
        data-link-flow-speed={String(hasMetricBinding ? uploadSpeed : computeFlowSpeed(runtimeMetrics, thresholds) * 0.5)}
        data-link-flow-active={uploadFlowActive ? 'true' : 'false'}
        stroke={uploadColor}
        strokeWidth={flowStroke}
        strokeDasharray={LINK_FLOW_DASH}
        strokeDashoffset="0"
        fill="none"
        pointerEvents="none"
        opacity={selected ? 0.95 : hovered ? 0.9 : 0.82}
        {...lineCap}
      />
      {labelText ? (
        <g
          transform={`translate(${mid.x - Math.sin(labelRad) * labelOffset}, ${mid.y + Math.cos(labelRad) * labelOffset})`}
          pointerEvents="none"
        >
          <rect
            x={-labelWidth / 2}
            y={-7}
            width={labelWidth}
            height={14}
            rx={7}
            fill="rgba(18,18,20,0.88)"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={0.5}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            fontFamily="Inter, Helvetica, Arial, sans-serif"
            fontWeight={600}
          >
            {txLabel ? <tspan fill={uploadLabelColor}>↑{txLabel}</tspan> : null}
            {txLabel && rxLabel ? <tspan fill="rgba(227,242,253,0.45)"> </tspan> : null}
            {rxLabel ? <tspan fill={downloadLabelColor}>↓{rxLabel}</tspan> : null}
          </text>
        </g>
      ) : null}
    </g>
  );
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
    prev.hovered !== next.hovered ||
    prev.editable !== next.editable ||
    prev.panTool !== next.panTool
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
