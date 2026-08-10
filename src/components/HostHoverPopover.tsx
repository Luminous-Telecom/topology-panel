import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { PanelData, TimeRange } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import {
  HostDisplayMap,
  HostMetadataMap,
  HostProblemMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import { HostLookupRef, lookupHostDisplay, lookupProblemCount, resolveHostIp } from '../utils';
import {
  extractHostHoverSeries,
  formatHoverMetricValue,
  HostHoverSeries,
  hoverMetricLabel,
} from '../utils/hostTimeSeries';

interface Props {
  node: TopologyNode;
  screenX: number;
  screenY: number;
  queryData?: PanelData;
  timeRange?: TimeRange;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  problemMap?: HostProblemMap;
  options: TopologyPanelOptions;
  icmpReady?: boolean;
}

const CHART_W = 260;
const CHART_H = 56;
const PAD = 4;

function hostTitle(node: TopologyNode): string {
  return node.label?.trim() || node.zabbixHost?.trim() || node.id;
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function Sparkline({
  series,
  colorOnline,
  colorOffline,
}: {
  series: HostHoverSeries;
  colorOnline: string;
  colorOffline: string;
}) {
  const { points, metric } = series;
  if (points.length < 2) {
    return null;
  }

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = Math.max(tMax - tMin, 1);

  let yMax = 0;
  for (const point of points) {
    if (metric === 'packet_loss') {
      yMax = Math.max(yMax, point.value);
    } else if (point.value > 0) {
      yMax = Math.max(yMax, point.value * 1000);
    }
  }
  if (metric === 'packet_loss') {
    yMax = Math.max(yMax, 1);
  } else {
    yMax = Math.max(yMax, 1);
  }

  const innerW = CHART_W - PAD * 2;
  const innerH = CHART_H - PAD * 2;

  const toX = (t: number) => PAD + ((t - tMin) / tSpan) * innerW;
  const toY = (displayValue: number) => PAD + innerH - (displayValue / yMax) * innerH;

  const pathD = points
    .map((point, idx) => {
      const x = toX(point.t);
      const displayValue =
        metric === 'packet_loss' ? point.value : point.value <= 0 ? 0 : point.value * 1000;
      const y = toY(displayValue);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={CHART_W} height={CHART_H} aria-hidden>
      <rect x={0} y={0} width={CHART_W} height={CHART_H} fill="rgba(255,255,255,0.04)" rx={3} />
      <path
        d={pathD}
        fill="none"
        stroke={colorOnline}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point, idx) =>
        point.status === 'offline' ? (
          <circle
            key={idx}
            cx={toX(point.t)}
            cy={toY(metric === 'packet_loss' ? point.value : 0)}
            r={2.5}
            fill={colorOffline}
          />
        ) : null
      )}
    </svg>
  );
}

export function HostHoverPopover({
  node,
  screenX,
  screenY,
  queryData,
  timeRange,
  hostMetadata,
  hostDisplay,
  problemMap,
  options,
  icmpReady,
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
  const problemCount = lookupProblemCount(problemMap ?? {}, lookupRef, hostMetadata);
  const ip = resolveHostIp(node, hostMetadata);

  const lastPoint = series?.points[series.points.length - 1];
  const periodLabel = timeRange
    ? `${formatClock(timeRange.from.valueOf())} – ${formatClock(timeRange.to.valueOf())}`
    : 'Período do dashboard';

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
  }, [screenX, screenY, series, problemCount, display?.text]);

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

  const failureStyle = css`
    margin-top: 6px;
    color: ${theme.colors.error.text};
    font-size: 11px;
  `;

  const alertStyle = css`
    margin-top: 4px;
    color: ${options.colorAlert || theme.colors.warning.text};
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

      {!icmpReady ? (
        <div className={emptyStyle}>Aguardando dados da Query…</div>
      ) : series ? (
        <>
          <div className={statRowStyle}>
            <span>{hoverMetricLabel(series.metric)}</span>
            {lastPoint ? (
              <span>
                Agora: {formatHoverMetricValue(series.metric, lastPoint.value)}
                {display?.text ? ` · ${display.text}` : ''}
              </span>
            ) : null}
          </div>
          <Sparkline series={series} colorOnline={options.colorOnline} colorOffline={options.colorOffline} />
          {series.failureCount > 0 ? (
            <div className={failureStyle}>
              {series.failureCount} falha{series.failureCount === 1 ? '' : 's'} no período
              {series.lastFailureAt ? ` · última ${formatClock(series.lastFailureAt)}` : ''}
            </div>
          ) : (
            <div className={subtitleStyle} style={{ marginTop: 6 }}>
              Sem falhas ICMP no período
            </div>
          )}
        </>
      ) : (
        <div className={emptyStyle}>Sem série ICMP da Query para este host</div>
      )}

      {problemCount > 0 ? (
        <div className={alertStyle}>
          {problemCount} problema{problemCount === 1 ? '' : 's'} Zabbix ativo{problemCount === 1 ? '' : 's'}
        </div>
      ) : null}
    </div>,
    document.body
  );
}
