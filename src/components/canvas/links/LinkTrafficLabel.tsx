import React from 'react';
import { useTheme2 } from '@grafana/ui';
import { LinkRuntimeMetrics, TopologyLink, TopologyPanelOptions } from '../../../types';
import { LinkBox, LinkPoint, linkTrafficAnchor, sameLinkPoints } from '../../../utils/linkGeometry';
import { resolveLinkMapTrafficMetrics } from '../../../utils/linkMetricsRuntime';
import { linkKey } from '../../../utils/mapLinkEdits';
import { resolvePanelColor } from '../../../utils/panelColors';
import { formatBitsPerSecond } from '../../../utils/zabbixAdapter/formatTraffic';
import { LINK_PILL_FILL, LINK_PILL_STROKE } from './linkLineVisual';

interface TrafficLabelProps {
  pillId: string;
  x: number;
  y: number;
  txLabel?: string;
  rxLabel?: string;
  uploadColor: string;
  downloadColor: string;
}

function pillLineWidth(value: string, padX: number, charW: number): number {
  return (value.length + 2) * charW + padX * 2;
}

const PILL_TEXT = {
  textAnchor: 'middle' as const,
  dominantBaseline: 'middle' as const,
  fontSize: 11,
  fontFamily: 'Inter, Helvetica, Arial, sans-serif',
  fontWeight: 600,
  letterSpacing: 0.15,
};

function LinkTrafficLabelComponent({
  pillId,
  x,
  y,
  txLabel,
  rxLabel,
  uploadColor,
  downloadColor,
}: TrafficLabelProps) {
  const valueFill = 'rgba(240,243,248,0.96)';
  const padX = 10;
  const charW = 6.45;
  const lineH = 14;
  const padY = 5;
  const both = Boolean(txLabel && rxLabel);
  const txWidth = txLabel ? pillLineWidth(txLabel, padX, charW) : 0;
  const rxWidth = rxLabel ? pillLineWidth(rxLabel, padX, charW) : 0;
  const width = Math.max(txWidth, rxWidth);
  const rows = (txLabel ? 1 : 0) + (rxLabel ? 1 : 0);
  const height = rows * lineH + padY * 2;
  let txY = 0;
  let rxY = 0;
  if (both) {
    txY = -lineH / 2;
    rxY = lineH / 2;
  }
  return (
    <g data-link-pill={pillId} transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={8}
        fill={LINK_PILL_FILL}
        stroke={LINK_PILL_STROKE}
        strokeWidth={1}
      />
      {txLabel ? (
        <text x={0} y={txY} data-link-pill-tx {...PILL_TEXT}>
          <tspan fill={uploadColor}>↑</tspan>
          <tspan data-link-pill-tx-value fill={valueFill}>
            {txLabel ? ` ${txLabel}` : ''}
          </tspan>
        </text>
      ) : (
        <text x={0} y={txY} data-link-pill-tx {...PILL_TEXT} style={{ display: 'none' }}>
          <tspan fill={uploadColor}>↑</tspan>
          <tspan data-link-pill-tx-value fill={valueFill} />
        </text>
      )}
      {rxLabel ? (
        <text x={0} y={rxY} data-link-pill-rx {...PILL_TEXT}>
          <tspan fill={downloadColor}>↓</tspan>
          <tspan data-link-pill-rx-value fill={valueFill}>
            {rxLabel ? ` ${rxLabel}` : ''}
          </tspan>
        </text>
      ) : (
        <text x={0} y={rxY} data-link-pill-rx {...PILL_TEXT} style={{ display: 'none' }}>
          <tspan fill={downloadColor}>↓</tspan>
          <tspan data-link-pill-rx-value fill={valueFill} />
        </text>
      )}
    </g>
  );
}

export const LinkTrafficLabel = React.memo(LinkTrafficLabelComponent);

interface TrafficOverlayProps {
  from: LinkBox;
  to: LinkBox;
  gridStep: number;
  waypoints: LinkPoint[];
  bundleOffset: number;
  link: TopologyLink;
  runtimeMetrics?: LinkRuntimeMetrics;
  options: Pick<TopologyPanelOptions, 'colorLinkUpload' | 'colorLinkDownload'>;
}

function trafficPillSignature(link: TopologyLink, metrics?: LinkRuntimeMetrics): string {
  const display = resolveLinkMapTrafficMetrics(link, metrics);
  return `${formatBitsPerSecond(display.txBps) ?? ''}\n${formatBitsPerSecond(display.rxBps) ?? ''}`;
}

function sameBox(prev: LinkBox, next: LinkBox): boolean {
  return prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h;
}

/** Pílula de bps fora do `LinkLine` — o poll atualiza o texto sem remontar path/pulsos. */
function LinkTrafficOverlayComponent({
  from,
  to,
  gridStep,
  waypoints,
  bundleOffset,
  link,
  runtimeMetrics,
  options,
}: TrafficOverlayProps) {
  const theme = useTheme2();
  const display = resolveLinkMapTrafficMetrics(link, runtimeMetrics);
  const txLabel = formatBitsPerSecond(display.txBps);
  const rxLabel = formatBitsPerSecond(display.rxBps);
  if (!txLabel && !rxLabel) {
    return null;
  }
  const anchor = linkTrafficAnchor(from, to, gridStep, waypoints, bundleOffset);
  return (
    <LinkTrafficLabel
      pillId={linkKey(link)}
      x={anchor.x}
      y={anchor.y}
      txLabel={txLabel}
      rxLabel={rxLabel}
      uploadColor={resolvePanelColor(theme, options.colorLinkUpload)}
      downloadColor={resolvePanelColor(theme, options.colorLinkDownload)}
    />
  );
}

export const LinkTrafficOverlay = React.memo(LinkTrafficOverlayComponent, (prev, next) => {
  if (prev.gridStep !== next.gridStep || prev.bundleOffset !== next.bundleOffset) {
    return false;
  }
  if (!sameBox(prev.from, next.from) || !sameBox(prev.to, next.to)) {
    return false;
  }
  if (!sameLinkPoints(prev.waypoints, next.waypoints)) {
    return false;
  }
  if (
    prev.options.colorLinkUpload !== next.options.colorLinkUpload ||
    prev.options.colorLinkDownload !== next.options.colorLinkDownload
  ) {
    return false;
  }
  return trafficPillSignature(prev.link, prev.runtimeMetrics) === trafficPillSignature(next.link, next.runtimeMetrics);
});
