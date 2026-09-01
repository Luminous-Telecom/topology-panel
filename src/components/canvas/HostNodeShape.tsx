import React from 'react';
import {
  HostDisplayInfo,
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { textOnBackground } from '../../utils/colorContrast';
import { HostIconGlyph } from '../../utils/hostIcons';
import {
  RegionHostStats,
  formatRegionStats,
  regionHasOfflineHosts,
  resolveHostNodeStatus,
} from '../../utils/networkStats';
import { ColorResolver, resolveNodeFill } from '../../utils/nodeFillColors';
import { NodeLayout } from '../../utils/nodeLayout';
import { isHostNode } from '../../utils/topologyNodes';
import { lookupHostDisplay } from '../../utils/queryHosts';
import { sameStructure } from '../../utils/structuralIdentity';
import { resolveHostProblemSummary } from '../../utils/noc/topologyFilters';
import { HostNodeBadge, HostProblemsMap } from '../../utils/noc/types';
import { canvasStyles } from './canvasStyles';
import { HostNodeBadgeLayer } from './HostNodeBadgeLayer';

interface HostNodeShapeProps {
  node: TopologyNode;
  layout: NodeLayout & TopologyNode;
  /** Estatísticas agregadas — só existe para submapa. */
  region: RegionHostStats | undefined;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  /** True enquanto o Zabbix ainda não pintou — fundo de espera, sem cor de status. */
  queryLoading?: boolean;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  hostProblems?: HostProblemsMap;
  resolveColor: ColorResolver;
  badges?: HostNodeBadge[];
  dimmed?: boolean;
  isSelected: boolean;
  isSelectedLinkEndpoint: boolean;
  isLinkSource: boolean;
  isLinkTarget: boolean;
  onPointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onDoubleClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TopologyNode) => void;
  onMouseEnter: (e: React.MouseEvent, node: TopologyNode) => void;
  onMouseMove: (e: React.MouseEvent, node: TopologyNode) => void;
  onMouseLeave: (e: React.MouseEvent, node: TopologyNode) => void;
  onResizePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onResizePointerUp: (e: React.PointerEvent) => void;
}

/** Nó de host, submapa, texto ou seletor de dashboard: caixa, ícone, rótulo e subtítulo. */
function HostNodeShapeComponent({
  node,
  layout,
  region,
  options,
  queryReady,
  queryLoading = false,
  hostDisplay,
  hostMetadata,
  hostProblems,
  resolveColor,
  badges,
  dimmed = false,
  isSelected,
  isSelectedLinkEndpoint,
  isLinkSource,
  isLinkTarget,
  onPointerDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onResizePointerDown,
  onResizePointerUp,
}: HostNodeShapeProps) {
  const { w, h, label, sub, labelFontSize, subFontSize, labelY, subY, detailLines, detailLineYs, iconCenterY, x, y } = layout;
  const fill = resolveNodeFill(
    node,
    region,
    options,
    queryReady,
    hostMetadata,
    hostDisplay,
    resolveColor,
    hostProblems,
    queryLoading
  );
  const regionLabel = region ? formatRegionStats(region, queryReady, 'submap') : undefined;
  const labelColor =
    node.type === 'static' && node.labelColor
      ? resolveColor(node.labelColor)
      : textOnBackground(fill);
  const displaySub = regionLabel ?? sub;
  const statsSubFontSize = Math.max(9, subFontSize);
  const displaySubY =
    subY ??
    (displaySub
      ? labelY !== undefined && labelY < h * 0.45
        ? h - 8 - statsSubFontSize / 2
        : labelY !== undefined
          ? labelY + labelFontSize / 2 + 4 + statsSubFontSize / 2
          : h - 8 - statsSubFontSize / 2
      : undefined);
  const nodeIsHost = isHostNode(node);
  const hostStatus = nodeIsHost ? resolveHostNodeStatus(node, hostDisplay, hostMetadata) : undefined;
  const submapOffline = regionHasOfflineHosts(region, queryReady);
  const isOfflineBlink = hostStatus === 'offline' || submapOffline;
  const hostIcon = nodeIsHost ? node.icon ?? null : null;
  const textCenterX = x + w / 2;
  const iconX = x + w / 2;
  const iconY = iconCenterY !== undefined ? y + iconCenterY : y + h / 2;
  const cornerIconSize = Math.max(8, Math.round(labelFontSize * 0.85));
  const cornerIconY = y + Math.max(8, Math.round(labelFontSize * 0.55));

  return (
    <g
      data-node-id={node.id}
      data-node-type={node.type}
      className={isOfflineBlink ? canvasStyles.offlineBlink : undefined}
      opacity={dimmed ? 0.18 : 1}
      onPointerDown={(e) => onPointerDown(e, node)}
      onClick={(e) => onClick(e, node)}
      onDoubleClick={(e) => onDoubleClick(e, node)}
      onContextMenu={(e) => onContextMenu(e, node)}
      onMouseEnter={(e) => onMouseEnter(e, node)}
      onMouseMove={(e) => onMouseMove(e, node)}
      onMouseLeave={(e) => onMouseLeave(e, node)}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        ry={4}
        fill={fill}
        stroke={
          isSelected || isSelectedLinkEndpoint
            ? '#4FC3F7'
            : isLinkSource || isLinkTarget
              ? '#fff'
              : 'rgba(255,255,255,0.35)'
        }
        strokeWidth={isSelected || isSelectedLinkEndpoint ? 3 : isLinkSource || isLinkTarget ? 2 : 1}
      />
      {hostIcon && <HostIconGlyph icon={hostIcon} x={iconX} y={iconY} />}
      {(node.type === 'static' || node.type === 'submap' || node.type === 'dashboard_picker') && (
        <rect
          className={canvasStyles.resizeHandle}
          x={x + w - 10}
          y={y + h - 10}
          width={10}
          height={10}
          fill="rgba(255,255,255,0.45)"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={1}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => onResizePointerDown(e, node)}
          onPointerUp={(e) => onResizePointerUp(e)}
        />
      )}
      <text
        x={textCenterX}
        y={y + labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={labelColor}
        fontSize={labelFontSize}
        fontWeight={700}
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        pointerEvents="none"
      >
        {label}
      </text>
      {displaySub && displaySubY !== undefined && (
        <text
          x={textCenterX}
          y={y + displaySubY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={labelColor}
          fontSize={Math.max(9, subFontSize)}
          fontFamily="Inter, Helvetica, Arial, sans-serif"
          pointerEvents="none"
        >
          {displaySub}
        </text>
      )}
      {detailLines?.map((line, index) => {
        const lineY = detailLineYs?.[index];
        if (lineY === undefined) {
          return null;
        }
        return (
          <text
            key={`${node.id}-detail-${index}`}
            x={textCenterX}
            y={y + lineY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={labelColor}
            fontSize={Math.max(8, subFontSize - 1)}
            fontFamily="Inter, Helvetica, Arial, sans-serif"
            pointerEvents="none"
          >
            {line}
          </text>
        );
      })}
      {node.type === 'submap' && (
        <text
          x={x + w - 8}
          y={cornerIconY}
          textAnchor="end"
          fill={labelColor}
          fontSize={cornerIconSize}
          pointerEvents="none"
        >
          ↗
        </text>
      )}
      {node.type === 'dashboard_picker' && (
        <text
          x={x + w - 8}
          y={cornerIconY}
          textAnchor="end"
          fill={labelColor}
          fontSize={cornerIconSize}
          pointerEvents="none"
        >
          ▾
        </text>
      )}
      {badges?.length ? <HostNodeBadgeLayer badges={badges} x={x} y={y} width={w} /> : null}
    </g>
  );
}

/**
 * `hostDisplay` é o mapa de status do mapa **inteiro**, então ele troca de identidade sempre que
 * qualquer host muda de valor. Comparar por identidade fazia um único host offline redesenhar os
 * quinhentos nós; o que este nó realmente lê do mapa é uma entrada só.
 *
 * `updatedAtSec` (lastclock) não entra: o poll do Zabbix atualiza o relógio de todos os itens
 * mesmo com o mesmo lastvalue, e isso redesenhava o SVG inteiro a cada intervalo.
 */
function hostDisplayPaintSlice(info: HostDisplayInfo | undefined): unknown {
  if (!info) {
    return info;
  }
  return {
    value: info.value,
    color: info.color,
    text: info.text,
    status: info.status,
  };
}

function sameResolvedHostDisplay(prev: HostNodeShapeProps, next: HostNodeShapeProps): boolean {
  if (prev.hostDisplay === next.hostDisplay) {
    return true;
  }
  // Submapa, texto e seletor de dashboard não leem status de host.
  if (!isHostNode(next.node)) {
    return true;
  }
  const lookupRef = {
    zabbixHost: next.node.zabbixHost,
    subtitle: next.node.subtitle,
    label: next.node.label,
  };
  return sameStructure(
    hostDisplayPaintSlice(lookupHostDisplay(next.hostDisplay, lookupRef, next.hostMetadata)),
    hostDisplayPaintSlice(lookupHostDisplay(prev.hostDisplay, lookupRef, prev.hostMetadata))
  );
}

function sameResolvedHostProblems(prev: HostNodeShapeProps, next: HostNodeShapeProps): boolean {
  if (prev.hostProblems === next.hostProblems) {
    return true;
  }
  if (!isHostNode(next.node)) {
    return true;
  }
  return sameStructure(
    resolveHostProblemSummary(next.node, next.hostMetadata, next.hostProblems),
    resolveHostProblemSummary(prev.node, prev.hostMetadata, prev.hostProblems)
  );
}

/**
 * Só redesenha quando alguma prop do próprio nó muda.
 *
 * Sem isso, cada frame de pan/zoom e cada hover redesenhava a caixa, o ícone e os textos de todos
 * os nós do mapa. Depende de `layout` e `badges` terem identidade estável — ver
 * `useNodeLayouts` e `buildHostNodeBadgeMap`.
 *
 * Toda prop é comparada por identidade (prop nova entra na conta sozinha); só `hostDisplay` e
 * `hostProblems`, que são do mapa inteiro, são comparados pelo recorte que este nó usa.
 */
export const HostNodeShape = React.memo(HostNodeShapeComponent, (prev, next) => {
  const keys = Object.keys(next) as Array<keyof HostNodeShapeProps>;
  if (keys.length !== Object.keys(prev).length) {
    return false;
  }
  for (const key of keys) {
    if (key === 'hostDisplay' || key === 'hostProblems') {
      continue;
    }
    if (!Object.is(prev[key], next[key])) {
      return false;
    }
  }
  return sameResolvedHostDisplay(prev, next) && sameResolvedHostProblems(prev, next);
});
