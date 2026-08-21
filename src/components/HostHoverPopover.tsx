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
import { HostLookupRef, resolveHostIp } from '../utils/hostLookup';
import { lookupHostDisplay } from '../utils/queryHosts';
import { useHostHoverSeries } from '../hooks/useHostHoverSeries';
import {
  formatHoverFieldValue,
  hostHoverPeriodLabel,
  HostHoverSeries,
  hoverMetricLabel,
  TopologyHoverMetric,
} from '../utils/hostTimeSeries';
import { resolveMappingLabel } from '../utils/statusMapping';

interface Props {
  node: TopologyNode;
  screenX: number;
  screenY: number;
  queryData?: PanelData;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  zabbixDatasourceUid?: string;
}

const CHART_W = 260;
const CHART_H = 56;
const PAD = 4;
const SPARKLINE_STROKE = 1.5;

function hostTitle(node: TopologyNode): string {
  return node.label?.trim() || node.zabbixHost?.trim() || node.id;
}

function sparklineDisplayValue(metric: TopologyHoverMetric, value: number): number {
  if (metric === 'packet_loss') {
    return value;
  }
  if (value <= 0) {
    return 0;
  }
  return value * 1000;
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
    yMax = Math.max(yMax, sparklineDisplayValue(metric, point.value));
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

  const pathCmd = (point: (typeof points)[number], idx: number) => {
    const x = toX(point.t);
    const y = toY(sparklineDisplayValue(metric, point.value));
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  };

  const pathD = points.map(pathCmd).join(' ');
  const offlinePathDs: string[] = [];
  let offlineRun: typeof points = [];
  const flushOfflineRun = () => {
    if (offlineRun.length === 1) {
      const cmd = pathCmd(offlineRun[0], 0);
      offlinePathDs.push(`${cmd} ${cmd.replace(/^M/, 'L')}`);
    } else if (offlineRun.length > 1) {
      offlinePathDs.push(offlineRun.map(pathCmd).join(' '));
    }
    offlineRun = [];
  };
  for (const point of points) {
    if (point.status === 'offline') {
      offlineRun.push(point);
    } else {
      flushOfflineRun();
    }
  }
  flushOfflineRun();

  return (
    <svg width={CHART_W} height={CHART_H} aria-hidden>
      <rect x={0} y={0} width={CHART_W} height={CHART_H} fill="rgba(255,255,255,0.04)" rx={3} />
      <path
        d={pathD}
        fill="none"
        stroke={colorOnline}
        strokeWidth={SPARKLINE_STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {offlinePathDs.map((d, idx) => (
        <path
          key={idx}
          d={d}
          fill="none"
          stroke={colorOffline}
          strokeWidth={SPARKLINE_STROKE}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
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
  zabbixDatasourceUid,
}: Props) {
  const theme = useTheme2();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: screenX + 12, top: screenY + 12 });

  const lookupRef = useMemo<HostLookupRef>(
    () => ({
      zabbixHost: node.zabbixHost,
      subtitle: node.subtitle,
      label: node.label,
      zabbixHostId: node.zabbixHostId,
    }),
    [node.zabbixHost, node.subtitle, node.label, node.zabbixHostId]
  );

  const { series, loading: seriesLoading } = useHostHoverSeries({
    enabled: true,
    queryData,
    lookupRef,
    hostMetadata,
    options,
    queryReady,
    zabbixDatasourceUid,
  });

  const display = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  const ip = resolveHostIp(node, hostMetadata);
  const sparklineLineColor = options.colorOnline;
  const offlineColor = options.colorOffline;

  const lastPoint = series?.points[series.points.length - 1];
  const periodLabel = hostHoverPeriodLabel(series, queryData?.timeRange);
  const metricLabel = series ? hoverMetricLabel(series.metric) : 'ICMP';
  const statusLabel = lastPoint
    ? resolveMappingLabel(lastPoint.value, options.statusValueMappings)
    : display?.text;

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

  const failureStyle = css`
    margin-top: 6px;
    color: ${theme.colors.error.text};
    font-size: 11px;
  `;

  const emptyStyle = css`
    margin-top: 8px;
    color: ${theme.colors.text.secondary};
    font-size: 11px;
  `;

  function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return createPortal(
    <div ref={popoverRef} className={panelStyle} role="tooltip">
      <strong>{hostTitle(node)}</strong>
      {ip ? <div className={subtitleStyle}>{ip}</div> : null}
      <div className={subtitleStyle}>{periodLabel}</div>

      {!queryReady || seriesLoading ? (
        <div className={emptyStyle}>
          Carregando histórico do Zabbix…
        </div>
      ) : series ? (
        <>
          <div className={statRowStyle}>
            <span>{series.fieldLabel || metricLabel}</span>
            {lastPoint ? (
              <span>
                Agora: {formatHoverFieldValue(lastPoint, series.metric)}
                {statusLabel ? ` · ${statusLabel}` : ''}
              </span>
            ) : null}
          </div>
          <Sparkline series={series} colorOnline={sparklineLineColor} colorOffline={offlineColor} />
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
        <div className={emptyStyle}>
          Sem histórico ICMP no período (icmppingsec / icmppingloss)
        </div>
      )}
    </div>,
    document.body
  );
}
