import React from 'react';
import { TopologyNode, TopologyPanelOptions } from '../../types';
import { textOnBackground } from '../../utils/colorContrast';
import {
  RegionHostStats,
  formatRegionStats,
  regionHasOfflineHosts,
  regionStrokeColor,
} from '../../utils/networkStats';
import { ColorResolver, resolveNetworkFill } from '../../utils/nodeFillColors';
import { resolveNetworkFontSize } from '../../utils/networkFontSize';
import { NodeLayout, measureTextWidth } from '../../utils/nodeLayout';
import { canvasStyles } from './canvasStyles';

interface NetworkNodeShapeProps {
  node: TopologyNode;
  layout: NodeLayout & TopologyNode;
  stats: RegionHostStats | undefined;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  resolveColor: ColorResolver;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onDoubleClick: (e: React.MouseEvent, node: TopologyNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TopologyNode) => void;
  onResizePointerDown: (e: React.PointerEvent, node: TopologyNode) => void;
  onResizePointerUp: (e: React.PointerEvent) => void;
}

interface NetworkNodeTitleProps {
  layout: NodeLayout & TopologyNode;
  options: TopologyPanelOptions;
  resolveColor: ColorResolver;
  isSelected: boolean;
}

/** Caixa de rede: retângulo da região e contagem agregada de hosts. O título fica em `NetworkNodeTitle`. */
function NetworkNodeShapeComponent({
  node,
  layout,
  stats,
  options,
  queryReady,
  resolveColor,
  isSelected,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  onResizePointerDown,
  onResizePointerUp,
}: NetworkNodeShapeProps) {
  const { w, h, x, y } = layout;
  const fill = resolveNetworkFill(node, stats, options, queryReady, resolveColor);
  const networkOffline = regionHasOfflineHosts(stats, queryReady);
  const stroke = resolveColor(regionStrokeColor(stats, options, queryReady, node.borderColor));
  const statsLabel = stats ? formatRegionStats(stats, queryReady) : undefined;
  const statsPad = 8;
  const networkFontSize = resolveNetworkFontSize(options);
  const statsFontSize = Math.max(9, networkFontSize - 1);
  const statsY = statsLabel ? y + h - statsPad - statsFontSize / 2 : undefined;

  return (
    <g
      data-node-id={node.id}
      data-node-type={node.type}
      className={networkOffline ? canvasStyles.offlineBlink : undefined}
      pointerEvents="auto"
      onPointerDown={(e) => onPointerDown(e, node)}
      onDoubleClick={(e) => onDoubleClick(e, node)}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        ry={2}
        fill={fill}
        stroke={isSelected ? '#4FC3F7' : stroke}
        strokeWidth={isSelected ? 3 : 1.5}
        strokeOpacity={isSelected ? 1 : 0.85}
      />
      {statsLabel && statsY !== undefined && (
        <text
          x={x + 8}
          y={statsY}
          textAnchor="start"
          dominantBaseline="middle"
          fill={textOnBackground(fill)}
          fontSize={statsFontSize}
          fontFamily="Inter, Helvetica, Arial, sans-serif"
          pointerEvents="none"
        >
          {statsLabel}
        </text>
      )}
      <rect
        className={`${canvasStyles.resizeHandle} ${canvasStyles.networkResizeHandle}`}
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
    </g>
  );
}

/** Só redesenha quando a caixa, o status agregado ou a seleção mudam — não a cada pan/zoom. */
export const NetworkNodeShape = React.memo(NetworkNodeShapeComponent);

/** Título da rede, desenhado acima dos cabos para o nome não ficar tapado. */
function NetworkNodeTitleComponent({ layout, options, resolveColor, isSelected }: NetworkNodeTitleProps) {
  const { w, label, x, y } = layout;
  const titleFs = resolveNetworkFontSize(options);
  const titlePadX = 8;
  const titlePadY = 4;
  const titleMargin = 8;
  const titleH = Math.ceil(titleFs + titlePadY * 2);
  const titleW = Math.max(48, Math.ceil(measureTextWidth(label, titleFs, true) + titlePadX * 2));
  const titleX = x + (w - titleW) / 2;
  const titleY = y + titleMargin;
  const titleFill = resolveColor(options.colorStatic);
  const titleText = textOnBackground(titleFill);

  return (
    <g pointerEvents="none">
      <rect
        x={titleX}
        y={titleY}
        width={titleW}
        height={titleH}
        rx={4}
        ry={4}
        fill={titleFill}
        stroke={isSelected ? '#4FC3F7' : 'rgba(255,255,255,0.35)'}
        strokeWidth={isSelected ? 2 : 1}
      />
      <text
        x={titleX + titleW / 2}
        y={titleY + titleH / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={titleText}
        fontSize={titleFs}
        fontWeight={700}
        fontFamily="Inter, Helvetica, Arial, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

/** Pan, zoom e hover de cabo não mexem no título — não redesenha a cada gesto. */
export const NetworkNodeTitle = React.memo(NetworkNodeTitleComponent);
