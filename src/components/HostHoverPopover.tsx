import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { PanelData } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import { HostLookupRef, lookupHostDisplay, resolveHostIp } from '../utils';
import {
  extractHostHoverSeries,
  formatHoverFieldValue,
  hostHoverPeriodLabel,
} from '../utils/hostTimeSeries';

interface Props {
  node: TopologyNode;
  screenX: number;
  screenY: number;
  queryData?: PanelData;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  options: TopologyPanelOptions;
  queryReady?: boolean;
}

const CHART_W = 260;
const CHART_H = 56;
const PAD = 4;

function hostTitle(node: TopologyNode): string {
  return node.label?.trim() || node.zabbixHost?.trim() || node.id;
}

function Sparkline({
  series,
  lineColor,
}: {
  series: NonNullable<ReturnType<typeof extractHostHoverSeries>>;
  lineColor: string;
}) {
  const { points } = series;
  if (points.length < 2) {
    return null;
  }

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = Math.max(tMax - tMin, 1);

  let yMax = 0;
  for (const point of points) {
    yMax = Math.max(yMax, Math.abs(point.value));
  }
  yMax = Math.max(yMax, 1);

  const innerW = CHART_W - PAD * 2;
  const innerH = CHART_H - PAD * 2;

  const toX = (t: number) => PAD + ((t - tMin) / tSpan) * innerW;
  const toY = (value: number) => PAD + innerH - (Math.abs(value) / yMax) * innerH;

  const pathD = points
    .map((point, idx) => {
      const x = toX(point.t);
      const y = toY(point.value);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={CHART_W} height={CHART_H} aria-hidden>
      <rect x={0} y={0} width={CHART_W} height={CHART_H} fill="rgba(255,255,255,0.04)" rx={3} />
      <path
        d={pathD}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HostHoverPopover({
  node,
  screenX,
  screenY,
  queryData,
  hostMetadata,
  hostDisplay,
  options,
  queryReady,
}: Props) {
  const theme = useTheme2();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: screenX + 12, top: screenY + 12 });

  const lookupRef = useMemo<HostLookupRef>(
    () => ({
      zabbixHost: node.zabbixHost,
      subtitle: node.subtitle,
      label: node.label,
    }),
    [node.zabbixHost, node.subtitle, node.label]
  );

  const series = useMemo(
    () => extractHostHoverSeries(queryData, lookupRef, hostMetadata),
    [hostMetadata, lookupRef, queryData]
  );

  const display = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  const ip = resolveHostIp(node, hostMetadata);
  const lineColor = display?.color ? String(display.color) : theme.colors.text.secondary;

  const lastPoint = series?.points[series.points.length - 1];
  const periodLabel = hostHoverPeriodLabel(series);

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) {
      return;
    }
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let left = screenX + 12;
    let top = screenY + 12;
    if (left + rect.width > window.innerWidth - margin) {
      left = screenX - rect.width - 12;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = screenY - rect.height - 12;
    }
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    setPosition({ left, top });
  }, [screenX, screenY, series, display?.text]);

  const panelStyle = css`
    position: fixed;
    left: ${position.left}px;
    top: ${position.top}px;
    z-index: 10000;
    width: ${CHART_W + 24}px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid ${theme.colors.border.medium};
    background: ${theme.colors.background.primary};
    box-shadow: ${theme.shadows.z3};
    pointer-events: none;
    font-size: 12px;
    color: ${theme.colors.text.primary};
  `;

  const subtitleStyle = css`
    color: ${theme.colors.text.secondary};
    font-size: 11px;
    margin-top: 2px;
  `;

  const statRowStyle = css`
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    font-size: 11px;
  `;

  const emptyStyle = css`
    margin-top: 8px;
    color: ${theme.colors.text.secondary};
    font-size: 11px;
  `;

  return createPortal(
    <div ref={popoverRef} className={panelStyle} role="tooltip">
      <strong>{hostTitle(node)}</strong>
      {ip ? <div className={subtitleStyle}>{ip}</div> : null}
      <div className={subtitleStyle}>{periodLabel}</div>

      {!queryReady ? (
        <div className={emptyStyle}>Aguardando dados da Query…</div>
      ) : series ? (
        <>
          <div className={statRowStyle}>
            <span>{series.fieldLabel}</span>
            {lastPoint ? (
              <span>
                Agora: {formatHoverFieldValue(lastPoint)}
                {display?.text ? ` · ${display.text}` : ''}
              </span>
            ) : null}
          </div>
          <Sparkline series={series} lineColor={lineColor} />
        </>
      ) : (
        <div className={emptyStyle}>Sem série da Query para este host</div>
      )}
    </div>,
    document.body
  );
}
