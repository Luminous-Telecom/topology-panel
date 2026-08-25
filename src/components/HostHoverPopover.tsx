import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { PanelData } from '@grafana/data';
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
  HostHoverSeriesMap,
  hoverMetricLabel,
  TopologyHoverMetric,
} from '../utils/hostTimeSeries';
import { resolveMappingLabel } from '../utils/statusMapping';
import { resolveHostProblemSummary, visibleHostProblemNames } from '../utils/noc/topologyFilters';
import { HostProblemsMap } from '../utils/noc/types';
import { overlayCardBodyStyle, overlayCardStyle, overlayMetricRowStyle, overlayMutedStyle, overlayStackedItemStyle } from './overlayChrome';
import { overlayPortalRoot } from '../utils/overlayPortal';
import { resolveHostDescription } from '../utils/mapSync';

interface Props {
  node: TopologyNode;
  screenX: number;
  screenY: number;
  queryData?: PanelData;
  hoverByHost?: HostHoverSeriesMap;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  hostProblems?: HostProblemsMap;
  options: TopologyPanelOptions;
  queryReady?: boolean;
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
  hoverByHost,
  hostMetadata,
  hostDisplay,
  hostProblems,
  options,
  queryReady,
}: Props) {
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
    lookupRef,
    hostMetadata,
    hoverByHost,
    queryReady,
  });

  const display = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  const ip = resolveHostIp(node, hostMetadata);
  const description = resolveHostDescription(node, hostMetadata);
  const sparklineLineColor = options.colorOnline;
  const offlineColor = options.colorOffline;

  const lastPoint = series?.points[series.points.length - 1];
  const periodLabel = hostHoverPeriodLabel(series, queryData?.timeRange);
  const metricLabel = series ? hoverMetricLabel(series.metric) : 'ICMP';
  const statusLabel = lastPoint
    ? resolveMappingLabel(lastPoint.value, options.statusValueMappings)
    : display?.text;
  const problemSummary = resolveHostProblemSummary(node, hostMetadata, hostProblems);
  const problems = visibleHostProblemNames(problemSummary?.names);

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
  }, [screenX, screenY, series, display?.text, description, problems.visible.length, problems.hidden]);

  const panelStyle = css`
    position: fixed;
    left: ${position.left}px;
    top: ${position.top}px;
    z-index: 10000;
    width: ${CHART_W + 24}px;
    pointer-events: none;
    font-size: 12px;
  `;

  const failureStyle = css`
    margin-top: 6px;
    color: #ef9a9a;
    font-size: 11px;
  `;

  const problemsWrapStyle = css`
    margin-top: 8px;
  `;

  const problemNameStyle = css`
    margin-top: 2px;
    color: ${options.colorAlert};
    font-size: 11px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  `;

  function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return createPortal(
    <div ref={popoverRef} className={`${overlayCardStyle} ${overlayCardBodyStyle} ${panelStyle}`} role="tooltip">
      <strong>{hostTitle(node)}</strong>
      {description ? (
        <div className={overlayMutedStyle} style={{ overflowWrap: 'anywhere' }}>
          {description}
        </div>
      ) : null}
      {ip ? <div className={overlayMutedStyle}>{ip}</div> : null}
      <div className={overlayMutedStyle}>{periodLabel}</div>

      {!queryReady || seriesLoading ? (
        <div className={overlayMutedStyle} style={{ marginTop: 8 }}>
          Carregando histórico do Zabbix…
        </div>
      ) : series ? (
        <>
          <div className={overlayMetricRowStyle} style={{ marginTop: 8 }}>
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
            <div className={overlayMutedStyle} style={{ marginTop: 6 }}>
              Sem falhas ICMP no período
            </div>
          )}
        </>
      ) : (
        <div className={overlayMutedStyle} style={{ marginTop: 8 }}>
          Sem histórico ICMP no período (icmppingsec / icmppingloss)
        </div>
      )}
      {problems.visible.length > 0 ? (
        <div className={problemsWrapStyle}>
          <div className={overlayMutedStyle}>
            {problems.visible.length + problems.hidden === 1
              ? 'Problema ativo'
              : `Problemas ativos (${problems.visible.length + problems.hidden})`}
          </div>
          {problems.visible.map((name, idx) => (
            <div key={`${idx}:${name}`} className={`${problemNameStyle} ${overlayStackedItemStyle}`}>
              {name}
            </div>
          ))}
          {problems.hidden > 0 ? (
            <div className={overlayMutedStyle}>e mais {problems.hidden}</div>
          ) : null}
        </div>
      ) : null}
    </div>,
    overlayPortalRoot()
  );
}
