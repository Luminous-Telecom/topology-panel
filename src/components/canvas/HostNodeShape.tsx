import React from 'react';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../../types';
import { textOnBackground } from '../../utils/colorContrast';
import { resolveHostIp } from '../../utils/hostLookup';
import { HostIconGlyph, hostIconRenderSize } from '../../utils/hostIcons';
import {
  RegionHostStats,
  formatRegionStats,
  regionHasOfflineHosts,
  resolveHostNodeStatus,
} from '../../utils/networkStats';
import { ColorResolver, resolveNodeFill } from '../../utils/nodeFillColors';
import { NodeLayout } from '../../utils/nodeLayout';
import { isHostNode } from '../../utils/topologyNodes';
import { HostNodeBadge } from '../../utils/noc/types';
import { canvasStyles } from './canvasStyles';
import { HostNodeBadgeLayer } from './HostNodeBadgeLayer';

interface HostNodeShapeProps {
  node: TopologyNode;
  layout: NodeLayout & TopologyNode;
  /** Estatísticas agregadas — só existe para submapa. */
  region: RegionHostStats | undefined;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  hostDisplay?: HostDisplayMap;
  hostMetadata?: HostMetadataMap;
  resolveColor: ColorResolver;
  badges?: HostNodeBadge[];
  dimmed?: boolean;
  isSelected: boolean;
  isSelectedLinkEndpoint: boolean;
  isLinkSource: boolean;
  isLinkTarget: boolean;
  /** Está no modo "criar link" — muda o cursor para mira. */
  linkMode: boolean;
  panTool: boolean;
  editable: boolean;
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
export function HostNodeShape({
  node,
  layout,
  region,
  options,
  queryReady,
  hostDisplay,
  hostMetadata,
  resolveColor,
  badges,
  dimmed = false,
  isSelected,
  isSelectedLinkEndpoint,
  isLinkSource,
  isLinkTarget,
  linkMode,
  panTool,
  editable,
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
  const fill = resolveNodeFill(node, region, options, queryReady, hostMetadata, hostDisplay, resolveColor);
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

  return (
    <g
      data-node-id={node.id}
      className={isOfflineBlink ? canvasStyles.offlineBlink : undefined}
      opacity={dimmed ? 0.18 : 1}
      onPointerDown={(e) => onPointerDown(e, node)}
      onClick={(e) => onClick(e, node)}
      onDoubleClick={(e) => onDoubleClick(e, node)}
      onContextMenu={(e) => onContextMenu(e, node)}
      onMouseEnter={(e) => onMouseEnter(e, node)}
      onMouseMove={(e) => onMouseMove(e, node)}
      onMouseLeave={(e) => onMouseLeave(e, node)}
      style={{
        cursor: panTool
          ? options.enablePan
            ? 'grab'
            : 'default'
          : editable
            ? linkMode
              ? 'crosshair'
              : 'move'
            : isHostNode(node) && resolveHostIp(node, hostMetadata)
              ? 'context-menu'
              : node.type === 'submap' || node.type === 'dashboard_picker'
                ? 'pointer'
                : 'default',
      }}
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
      {hostIcon && (
        <HostIconGlyph icon={hostIcon} x={iconX} y={iconY} size={hostIconRenderSize(hostIcon)} />
      )}
      {editable &&
        (node.type === 'static' || node.type === 'submap' || node.type === 'dashboard_picker') && (
        <rect
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
        <text x={x + w - 8} y={y + 12} textAnchor="end" fill={labelColor} fontSize={10} pointerEvents="none">
          ↗
        </text>
      )}
      {node.type === 'dashboard_picker' && (
        <text x={x + w - 8} y={y + 12} textAnchor="end" fill={labelColor} fontSize={10} pointerEvents="none">
          ▾
        </text>
      )}
      {badges?.length ? <HostNodeBadgeLayer badges={badges} x={x} y={y} width={w} /> : null}
    </g>
  );
}
