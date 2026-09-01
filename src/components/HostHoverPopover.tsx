import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import { HostLookupRef, resolveHostIp } from '../utils/hostLookup';
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
  const ip = resolveHostIp(node, hostMetadata);
  const description = resolveHostDescription(node, hostMetadata);
  const statusLabel = display?.text?.trim();
  const collectedAt = formatLastClock(display?.updatedAtSec);
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
  }, [screenX, screenY, display?.text, description, problems.visible.length, problems.hidden]);

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
