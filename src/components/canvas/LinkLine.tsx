import React from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { formatLinkBandwidth, linkStrokeWidth } from '../../utils/linkBandwidth';
import { LINK_FLOW_DASH } from '../../utils/linkFlow';
import {
  computeFlowSpeed,
  isLinkCongested,
  resolveFlowLaneSpeed,
} from '../../utils/linkFlowSpeed';
import { utilizationThresholdsFromOptions } from '../../utils/linkMetricsRuntime';
import { linkKey } from '../../utils/mapLinkEdits';
import { resolvePanelColor } from '../../utils/panelColors';
import { buildLinkPathD, computeLinkGeometry, linkLabelAnchor, LinkPoint } from '../../utils/linkGeometry';
import { resolveLinkMedium } from '../../utils/linkMedium';
import { formatBitsPerSecond } from '../../utils/zabbixAdapter/formatTraffic';
import { NodeLayout } from '../../utils/nodeLayout';

interface LinkLineProps {
  link: TopologyLink;
  waypoints: LinkPoint[];
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  editable: boolean;
  panTool: boolean;
  selected: boolean;
  hovered: boolean;
  runtimeMetrics?: LinkRuntimeMetrics;
  onSelect: () => void;
  onHoverChange: (active: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPathPointerDown: (e: React.PointerEvent) => void;
  onPathDoubleClick: (e: React.MouseEvent) => void;
}

function LinkLineComponent({
  link,
  waypoints,
  nodeLayouts,
  options,
  editable,
  panTool,
  selected,
  hovered,
  runtimeMetrics,
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
  const { d, pathPoints } = geom;
  const hasWaypoints = waypoints.length > 0;
  const hitWidth = Math.max(10, linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, false, false) + 8);
  const active = selected || hovered;
  const medium = resolveLinkMedium(link);
  const dashArray = medium === 'radio' ? '10 6' : undefined;
  const strokeWidth = linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, selected, hovered);
  const laneOffset = Math.max(2, strokeWidth * 0.75);
  const downloadD = buildLinkPathD(pathPoints, gridStep, hasWaypoints, laneOffset);
  const uploadD = buildLinkPathD(pathPoints, gridStep, hasWaypoints, -laneOffset);
  const bandwidthLabel = formatLinkBandwidth(link.bandwidthMbps ?? runtimeMetrics?.from.capacityMbps);
  const fromName = link.fromInterface?.name;
  const toName = link.toInterface?.name;
  const txLabel = formatBitsPerSecond(runtimeMetrics?.from.txBps);
  const rxLabel = formatBitsPerSecond(runtimeMetrics?.from.rxBps);
  const trafficLines: string[] = [];
  if (txLabel) {
    trafficLines.push(`TX ${txLabel}`);
  }
  if (rxLabel) {
    trafficLines.push(`RX ${rxLabel}`);
  }
  const labelLines = [
    fromName && toName ? `${fromName} ↔ ${toName}` : undefined,
    bandwidthLabel,
    ...trafficLines,
  ].filter((line): line is string => Boolean(line));
  const labelText = labelLines[0] ?? bandwidthLabel;
  const subLabelText = labelLines.length > 1 ? labelLines.slice(1).join(' · ') : undefined;
  const mid = linkLabelAnchor(pathPoints, from, to);
  const labelWidth = Math.max(labelText?.length ?? 0, subLabelText?.length ?? 0) * 6;
  const tooltipParts = [
    from?.label || link.from,
    to?.label || link.to,
    fromName && toName ? `Interfaces: ${fromName} ↔ ${toName}` : undefined,
    bandwidthLabel ? `Capacidade: ${bandwidthLabel}` : undefined,
    txLabel ? `TX: ${txLabel}` : undefined,
    rxLabel ? `RX: ${rxLabel}` : undefined,
    runtimeMetrics?.from.txUtilizationPct !== undefined
      ? `Util. TX: ${runtimeMetrics.from.txUtilizationPct}%`
      : undefined,
    runtimeMetrics?.from.rxUtilizationPct !== undefined
      ? `Util. RX: ${runtimeMetrics.from.rxUtilizationPct}%`
      : undefined,
    runtimeMetrics?.status ? `Status: ${runtimeMetrics.status}` : undefined,
  ].filter((p): p is string => Boolean(p));
  const titleAttr = tooltipParts.length ? tooltipParts.join('\n') : undefined;
  const strokeColor = selected ? '#4FC3F7' : hovered ? '#81D4FA' : options.colorLink;
  const lineCap = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const markerStart = selected
    ? 'url(#link-dot-start-active)'
    : hovered
      ? 'url(#link-dot-start-hover)'
      : 'url(#link-dot-start)';
  const markerEnd = selected
    ? 'url(#link-arrow-end-active)'
    : hovered
      ? 'url(#link-arrow-end-hover)'
      : 'url(#link-arrow-end)';
  const thresholds = utilizationThresholdsFromOptions(options);
  const congested = isLinkCongested(runtimeMetrics, thresholds);
  const downloadColor = resolvePanelColor(
    theme,
    congested ? options.colorLinkCongestion : options.colorLinkDownload
  );
  const uploadColor = resolvePanelColor(
    theme,
    congested ? options.colorLinkCongestion : options.colorLinkUpload
  );
  const flowStroke = Math.max(1.5, strokeWidth - 1);
  const flowActive = runtimeMetrics?.status !== 'down';
  const downloadSpeed = resolveFlowLaneSpeed(runtimeMetrics?.from.rxBps, runtimeMetrics, thresholds);
  const uploadSpeed = resolveFlowLaneSpeed(runtimeMetrics?.from.txBps, runtimeMetrics, thresholds);
  const hasMetricBinding = Boolean(link.fromInterface?.metrics || link.toInterface?.metrics);
  const lk = linkKey(link);

  return (
    <g
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
        data-link-flow-active={flowActive && (hasMetricBinding ? downloadSpeed > 0 : true) ? 'true' : 'false'}
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
        data-link-flow-active={flowActive && (hasMetricBinding ? uploadSpeed > 0 : true) ? 'true' : 'false'}
        stroke={uploadColor}
        strokeWidth={flowStroke}
        strokeDasharray={LINK_FLOW_DASH}
        strokeDashoffset="0"
        fill="none"
        pointerEvents="none"
        opacity={selected ? 0.95 : hovered ? 0.9 : 0.82}
        {...lineCap}
      />
      {(labelText || subLabelText) && (
        <g transform={`translate(${mid.x}, ${mid.y}) rotate(${mid.angle})`} pointerEvents="none">
          <rect
            x={-labelWidth / 2}
            y={subLabelText ? -12 : -7}
            width={labelWidth}
            height={subLabelText ? 26 : 14}
            rx={3}
            fill="rgba(18,18,20,0.82)"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={0.5}
          />
          {labelText ? (
            <text
              x={0}
              y={subLabelText ? -3 : 0}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#E3F2FD"
              fontSize={9}
              fontFamily="Inter, Helvetica, Arial, sans-serif"
              fontWeight={500}
            >
              {labelText}
            </text>
          ) : null}
          {subLabelText ? (
            <text
              x={0}
              y={8}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#B0BEC5"
              fontSize={8}
              fontFamily="Inter, Helvetica, Arial, sans-serif"
            >
              {subLabelText}
            </text>
          ) : null}
        </g>
      )}
    </g>
  );
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
  if (JSON.stringify(prev.waypoints) !== JSON.stringify(next.waypoints)) {
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
    prev.options.colorLinkDownload === next.options.colorLinkDownload &&
    prev.options.colorLinkUpload === next.options.colorLinkUpload &&
    prev.options.colorLinkWidth === next.options.colorLinkWidth &&
    prev.options.gridSize === next.options.gridSize &&
    prev.options.colorLinkCongestion === next.options.colorLinkCongestion &&
    prev.options.linkUtilThresholdCritical === next.options.linkUtilThresholdCritical
  );
});
