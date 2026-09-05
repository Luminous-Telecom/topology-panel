import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import { HostLookupRef, resolveHostIp, resolveHostZabbixId } from '../utils/hostLookup';
import { useHostIcmpHistory, type IcmpHistoryRange } from '../hooks/useHostIcmpHistory';
import { useHostTemperatures } from '../hooks/useHostTemperatures';
import { formatTemperatureValue } from '../utils/hostTemperature';
import { HostIcmpSparkline } from './HostIcmpSparkline';
import { formatIcmpLossPct, formatIcmpRangeLabel, formatIcmpRttMs } from '../utils/icmpHistorySeries';
import { lookupHostDisplay } from '../utils/queryHosts';
import { resolveHostProblemSummary, visibleHostProblemNames } from '../utils/noc/topologyFilters';
import { HostProblemsMap } from '../utils/noc/types';
import { overlayCardBodyStyle, overlayCardStyle, overlayMetricRowStyle, overlayMutedStyle, overlayStackedItemStyle } from './chrome/overlayChrome';
import { clampFixedOverlayPosition, overlayPortalRoot } from '../utils/overlayPortal';
import { resolveHostDescription } from '../utils/mapSync';
import styles from './HostHoverPopover.module.scss';

interface Props {
  node: TopologyNode;
  screenX: number;
  screenY: number;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  hostProblems?: HostProblemsMap;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  datasourceUid?: string;
  historyRangeRef?: React.RefObject<IcmpHistoryRange>;
}

function hostTitle(node: TopologyNode): string {
  return node.label?.trim() || node.zabbixHost?.trim() || node.id;
}

function formatLastClock(updatedAtSec?: number): string | undefined {
  if (updatedAtSec == null || !Number.isFinite(updatedAtSec)) {
    return undefined;
  }
  return new Date(updatedAtSec * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function HostHoverPopover({
  node,
  screenX,
  screenY,
  hostMetadata,
  hostDisplay,
  hostProblems,
  options,
  queryReady,
  datasourceUid,
  historyRangeRef,
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

  const display = lookupHostDisplay(hostDisplay, lookupRef, hostMetadata);
  const hostid = resolveHostZabbixId(lookupRef, hostMetadata);
  const [historyRange] = useState<IcmpHistoryRange>(
    () => historyRangeRef?.current ?? { fromSec: 0, toSec: 0 }
  );
  const fromSec = historyRange.fromSec;
  const toSec = historyRange.toSec;
  const icmp = useHostIcmpHistory({
    enabled: Boolean(datasourceUid && hostid),
    datasourceUid,
    hostid,
    fromSec,
    toSec,
  });
  const showTemperature = options.showHostTemperature === true;
  const temps = useHostTemperatures({
    enabled: Boolean(showTemperature && datasourceUid && hostid),
    datasourceUid,
    hostid,
  });
  const ip = resolveHostIp(node, hostMetadata);
  const description = resolveHostDescription(node, hostMetadata);
  const statusLabel = display?.text?.trim();
  const collectedAt = formatLastClock(icmp.history?.status.lastClock ?? display?.updatedAtSec);
  const problemSummary =
    display?.status === 'offline'
      ? undefined
      : resolveHostProblemSummary(node, hostMetadata, hostProblems);
  const problems = visibleHostProblemNames(problemSummary?.names);

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) {
      return;
    }
    setPosition(
      clampFixedOverlayPosition(screenX, screenY, el.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    );
  }, [
    screenX,
    screenY,
    display?.text,
    description,
    problems.visible.length,
    problems.hidden,
    icmp.loading,
    icmp.history,
    icmp.loadError,
    temps.loading,
    temps.readings.length,
    temps.loadError,
  ]);

  return createPortal(
    <div
      ref={popoverRef}
      className={`${overlayCardStyle} ${overlayCardBodyStyle} ${styles.panel}`}
      style={{ left: position.left, top: position.top }}
      role="tooltip"
    >
      <strong>{hostTitle(node)}</strong>
      {description ? (
        <div className={`${overlayMutedStyle} ${styles.wrapAnywhere}`}>
          {description}
        </div>
      ) : null}
      {ip ? <div className={overlayMutedStyle}>{ip}</div> : null}

      {display ? (
        <>
          <div className={`${overlayMetricRowStyle} ${styles.metricGap}`}>
            <span>Status</span>
            <span>{statusLabel || String(display.value)}</span>
          </div>
          {collectedAt ? (
            <div className={`${overlayMutedStyle} ${styles.collected}`}>
              Coletado às {collectedAt}
            </div>
          ) : null}
        </>
      ) : !queryReady ? (
        <div className={`${overlayMutedStyle} ${styles.metricGap}`}>
          Carregando status…
        </div>
      ) : (
        <div className={`${overlayMutedStyle} ${styles.metricGap}`}>
          Sem status neste host
        </div>
      )}
      {showTemperature && datasourceUid && hostid ? (
        <div className={styles.historyWrap}>
          <div className={overlayMutedStyle}>Temperatura</div>
          {temps.loading ? (
            <div className={`${overlayMutedStyle} ${styles.metricGap}`}>Carregando temperaturas…</div>
          ) : null}
          {temps.loadError ? (
            <div className={`${overlayMutedStyle} ${styles.metricGap}`}>{temps.loadError}</div>
          ) : null}
          {!temps.loading && !temps.loadError && temps.readings.length === 0 ? (
            <div className={`${overlayMutedStyle} ${styles.metricGap}`}>Sem temperatura neste host</div>
          ) : null}
          {temps.readings.map((reading) => (
            <div key={reading.itemId} className={`${overlayMetricRowStyle} ${styles.metricGap}`}>
              <span className={styles.wrapAnywhere}>{reading.label}</span>
              <span>{formatTemperatureValue(reading.value, reading.units)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {datasourceUid && hostid ? (
        <div className={styles.historyWrap}>
          <div className={overlayMutedStyle}>
            ICMP no intervalo do dashboard
            {fromSec < toSec ? ` · ${formatIcmpRangeLabel(fromSec, toSec)}` : ''}
          </div>
          {icmp.loading ? (
            <div className={`${overlayMutedStyle} ${styles.metricGap}`}>Carregando histórico ICMP…</div>
          ) : null}
          {icmp.loadError ? (
            <div className={`${overlayMutedStyle} ${styles.metricGap}`}>{icmp.loadError}</div>
          ) : null}
          {icmp.history && !icmp.loading ? (
            <>
              <div className={`${overlayMetricRowStyle} ${styles.metricGap}`}>
                <span>Latência</span>
                <span>{formatIcmpRttMs(icmp.history.status.rttMs)}</span>
              </div>
              <HostIcmpSparkline
                points={icmp.history.rttMs}
                color={options.colorOnline}
                label="Histórico de latência ICMP"
              />
              <div className={`${overlayMetricRowStyle} ${styles.metricGap}`}>
                <span>Perda de pacote</span>
                <span style={{ color: options.colorOffline }}>
                  {formatIcmpLossPct(icmp.history.status.lossPct)}
                </span>
              </div>
              <HostIcmpSparkline
                points={icmp.history.lossPct}
                color={options.colorOffline}
                label="Histórico de perda de pacote ICMP"
              />
              {icmp.history.rttMs.length < 2 && icmp.history.lossPct.length < 2 ? (
                <div className={overlayMutedStyle}>Sem pontos neste intervalo</div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {problems.visible.length > 0 ? (
        <div className={styles.problemsWrap}>
          <div className={overlayMutedStyle}>
            {problems.visible.length + problems.hidden === 1
              ? 'Problema ativo'
              : `Problemas ativos (${problems.visible.length + problems.hidden})`}
          </div>
          {problems.visible.map((name, idx) => (
            <div
              key={`${idx}:${name}`}
              className={`${styles.problemName} ${overlayStackedItemStyle}`}
              style={{ color: options.colorAlert }}
            >
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
