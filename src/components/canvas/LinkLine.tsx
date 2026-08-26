import React from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { formatLinkBandwidth, linkStrokeWidth } from '../../utils/linkBandwidth';
import { LINK_FLOW_DASH, supportsFlowArrows } from '../../utils/linkFlow';
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
import {
  buildLinkPathD,
  computeLinkGeometry,
  linkLabelAnchor,
  LinkPoint,
  offsetPolyline,
  polylineLength,
} from '../../utils/linkGeometry';
import { resolveLinkMedium } from '../../utils/linkMedium';
import { formatBitsPerSecond, formatLinkMapTrafficLabel } from '../../utils/zabbixAdapter/formatTraffic';
import { NodeLayout } from '../../utils/nodeLayout';
import { canvasStyles } from './canvasStyles';

const LINK_RADIO_DASH = '10 6';
const LINK_SELECT_COLOR = '#4FC3F7';
const LINK_HOVER_COLOR = '#81D4FA';
const LINK_OUTLINE_COLOR = '#0d0f14';
/** Distância alvo entre setas de tráfego; o cabo curto recebe menos setas. */
const LINK_FLOW_ARROW_SPACING = 60;
const LINK_FLOW_ARROW_MAX = 4;
const LINK_LINE_CAP = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

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
  const prefix = kind === 'start' ? 'link-dot-start' : 'link-arrow-end';
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

/** O pacote é o elemento mais brilhante do cabo — opacidade alta em qualquer estado. */
function flowLaneOpacity(selected: boolean, hovered: boolean): number {
  if (selected) {
    return 1;
  }
  if (hovered) {
    return 1;
  }
  return 0.95;
}

/** Realce na cor de status: só em hover/seleção, para não competir com as faixas. */
function casingGlowOpacity(selected: boolean, hovered: boolean): number {
  if (selected) {
    return 0.22;
  }
  if (hovered) {
    return 0.14;
  }
  return 0;
}

function resolveLaneColor(args: {
  offline: boolean;
  utilLevel: ReturnType<typeof resolveLinkUtilizationLevel>;
  runtimeColor: string;
  degradationColor: string;
  configuredColor: string;
}): string {
  if (args.offline) {
    return args.runtimeColor;
  }
  if (args.utilLevel !== 'normal') {
    return args.degradationColor;
  }
  return args.configuredColor;
}

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
function LinkFlowArrows({
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
            offsetPath: `path('${laneD}')`,
            offsetRotate: 'auto',
            offsetDistance: '0px',
          }}
        />
      ))}
    </>
  );
}

interface TrafficLabelProps {
  x: number;
  y: number;
  txLabel?: string;
  rxLabel?: string;
  uploadColor: string;
  downloadColor: string;
}

function LinkTrafficLabel({ x, y, txLabel, rxLabel, uploadColor, downloadColor }: TrafficLabelProps) {
  const valueFill = 'rgba(240,243,248,0.96)';
  const padX = 11;
  const charW = 6.55;
  const extra = (txLabel && rxLabel ? 3 : 0) + (txLabel ? 2 : 0) + (rxLabel ? 2 : 0);
  const chars = (txLabel?.length ?? 0) + (rxLabel?.length ?? 0) + extra;
  const width = chars * charW + padX * 2;
  const height = 22;
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={4}
        fill="rgba(15,17,22,0.95)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.7}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontWeight={600}
        letterSpacing={0.15}
      >
        {txLabel ? <tspan fill={uploadColor}>↑</tspan> : null}
        {txLabel ? <tspan fill={valueFill}> {txLabel}</tspan> : null}
        {txLabel && rxLabel ? <tspan fill="rgba(255,255,255,0.24)">  ·  </tspan> : null}
        {rxLabel ? <tspan fill={downloadColor}>↓</tspan> : null}
        {rxLabel ? <tspan fill={valueFill}> {rxLabel}</tspan> : null}
      </text>
    </g>
  );
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
  const dashArray = medium === 'radio' ? LINK_RADIO_DASH : undefined;
  const strokeWidth = linkStrokeWidth(link.bandwidthMbps, options.colorLinkWidth, selected, hovered);
  // Cada sentido é um canal do cabo (padrão weathermap): TX acima da linha, RX abaixo.
  const laneWidth = Math.max(2.8, strokeWidth * 1.25);
  const laneOffset = laneWidth / 2 + 0.5;
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
  const labelRad = (mid.angle * Math.PI) / 180;
  const labelOffset = 15;
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
  const downloadColor = resolveLaneColor({
    offline: downloadOffline,
    utilLevel,
    runtimeColor,
    degradationColor,
    configuredColor: resolvePanelColor(theme, options.colorLinkDownload),
  });
  const uploadColor = resolveLaneColor({
    offline: uploadOffline,
    utilLevel,
    runtimeColor,
    degradationColor,
    configuredColor: resolvePanelColor(theme, options.colorLinkUpload),
  });
  const downloadLabelColor = resolvePanelColor(theme, options.colorLinkDownload);
  const uploadLabelColor = resolvePanelColor(theme, options.colorLinkUpload);
  // O pacote ocupa o canal inteiro: é ele que precisa ser visto, não a linha de fundo.
  const flowStroke = laneWidth;
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
  const laneOpacity = flowLaneOpacity(selected, hovered);
  const glowColor = selected ? LINK_SELECT_COLOR : LINK_HOVER_COLOR;
  const casingWidth = laneWidth * 2 + 2.8;
  const casingGlow = casingGlowOpacity(selected, hovered);
  const downloadFlowSpeed = hasMetricBinding
    ? downloadSpeed
    : computeFlowSpeed(runtimeMetrics, thresholds) * 0.5;
  const uploadFlowSpeed = hasMetricBinding
    ? uploadSpeed
    : computeFlowSpeed(runtimeMetrics, thresholds) * 0.5;
  // TX corre origem → destino; RX volta, então a seta anda por um path invertido (offset trocado).
  const downloadArrowD = buildLinkPathD(
    [...pathPoints].reverse(),
    gridStep,
    hasWaypoints,
    -(bundleOffset + laneOffset)
  );
  const uploadLaneLength = polylineLength(offsetPolyline(pathPoints, bundleOffset - laneOffset));
  const downloadLaneLength = polylineLength(offsetPolyline(pathPoints, bundleOffset + laneOffset));
  const arrowSize = Math.max(3.6, laneWidth * 1.3);

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
      {casingGlow > 0 && (
        <path
          d={d}
          stroke={glowColor}
          strokeWidth={casingWidth + 7}
          strokeOpacity={casingGlow}
          strokeDasharray={dashArray}
          fill="none"
          pointerEvents="none"
          {...LINK_LINE_CAP}
        />
      )}
      <path
        d={d}
        stroke={strokeColor}
        strokeWidth={casingWidth}
        strokeOpacity={1}
        strokeDasharray={dashArray}
        markerStart={markerStart}
        markerEnd={markerEnd}
        fill="none"
        pointerEvents="none"
        {...LINK_LINE_CAP}
      />
      <path
        d={d}
        stroke={LINK_OUTLINE_COLOR}
        strokeWidth={laneWidth * 2 + 1.1}
        strokeOpacity={1}
        strokeDasharray={dashArray}
        fill="none"
        pointerEvents="none"
        {...LINK_LINE_CAP}
      />
      <path
        d={uploadD}
        stroke={uploadColor}
        strokeWidth={laneWidth}
        strokeOpacity={0.2}
        strokeDasharray={dashArray}
        fill="none"
        pointerEvents="none"
        {...LINK_LINE_CAP}
      />
      <path
        d={downloadD}
        stroke={downloadColor}
        strokeWidth={laneWidth}
        strokeOpacity={0.2}
        strokeDasharray={dashArray}
        fill="none"
        pointerEvents="none"
        {...LINK_LINE_CAP}
      />
      {supportsFlowArrows ? (
        <g opacity={laneOpacity}>
          {!uploadOffline && (
            <LinkFlowArrows
              laneD={uploadD}
              laneLength={uploadLaneLength}
              color={uploadColor}
              direction="upload"
              linkId={lk}
              speed={uploadFlowSpeed}
              active={uploadFlowActive}
              size={arrowSize}
            />
          )}
          {!downloadOffline && (
            <LinkFlowArrows
              laneD={downloadArrowD}
              laneLength={downloadLaneLength}
              color={downloadColor}
              direction="download"
              linkId={lk}
              speed={downloadFlowSpeed}
              active={downloadFlowActive}
              size={arrowSize}
            />
          )}
        </g>
      ) : (
        <>
          <path
            d={downloadD}
            data-link-flow="download"
            data-link-key={lk}
            data-link-flow-speed={String(downloadFlowSpeed)}
            data-link-flow-active={downloadFlowActive ? 'true' : 'false'}
            stroke={downloadColor}
            strokeWidth={flowStroke}
            strokeDasharray={LINK_FLOW_DASH}
            strokeDashoffset="0"
            fill="none"
            pointerEvents="none"
            opacity={laneOpacity}
            {...LINK_LINE_CAP}
          />
          <path
            d={uploadD}
            data-link-flow="upload"
            data-link-key={lk}
            data-link-flow-speed={String(uploadFlowSpeed)}
            data-link-flow-active={uploadFlowActive ? 'true' : 'false'}
            stroke={uploadColor}
            strokeWidth={flowStroke}
            strokeDasharray={LINK_FLOW_DASH}
            strokeDashoffset="0"
            fill="none"
            pointerEvents="none"
            opacity={laneOpacity}
            {...LINK_LINE_CAP}
          />
        </>
      )}
      {labelText ? (
        <LinkTrafficLabel
          x={mid.x - Math.sin(labelRad) * labelOffset}
          y={mid.y + Math.cos(labelRad) * labelOffset}
          txLabel={txLabel}
          rxLabel={rxLabel}
          uploadColor={uploadLabelColor}
          downloadColor={downloadLabelColor}
        />
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
