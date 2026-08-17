import React from 'react';
import { TopologySuggestedLink, TopologyNode, TopologyPanelOptions } from '../../types';
import { buildLinkPathD, computeLinkGeometry, LinkPoint } from '../../utils/linkGeometry';
import { linkStrokeWidth } from '../../utils/linkBandwidth';
import { NodeLayout } from '../../utils/nodeLayout';

interface Props {
  suggestion: TopologySuggestedLink;
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  options: TopologyPanelOptions;
  selected: boolean;
  onSelect: () => void;
}

/** Link sugerido — tracejado, sem animação de tráfego. */
export function SuggestedLinkLine({ suggestion, nodeLayouts, options, selected, onSelect }: Props) {
  const from = nodeLayouts.get(suggestion.fromNodeId);
  const to = nodeLayouts.get(suggestion.toNodeId);
  if (!from || !to) {
    return null;
  }

  const gridStep = options.gridSize ?? 10;
  const waypoints: LinkPoint[] = [];
  const geom = computeLinkGeometry(from, to, gridStep, waypoints);
  const { d } = geom;
  const strokeWidth = linkStrokeWidth(undefined, options.colorLinkWidth, selected, false);
  const label = [suggestion.localPort, suggestion.remotePort].filter(Boolean).join(' ↔ ');
  const mid = { x: (from.x + from.w + to.x) / 2, y: (from.y + from.h + to.y) / 2 };

  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }}>
      <title>
        {`Sugerido (${suggestion.source.toUpperCase()}): ${label}\nConfiança: ${suggestion.confidence}`}
      </title>
      <path
        d={d}
        stroke="transparent"
        strokeWidth={Math.max(12, strokeWidth + 8)}
        fill="none"
        pointerEvents="stroke"
      />
      <path
        d={d}
        stroke={selected ? '#CE93D8' : '#9C27B0'}
        strokeWidth={strokeWidth}
        strokeDasharray="6 6"
        fill="none"
        pointerEvents="none"
        opacity={selected ? 0.95 : 0.65}
        strokeLinecap="round"
      />
      {label ? (
        <text
          x={mid.x}
          y={mid.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#E1BEE7"
          fontSize={8}
          pointerEvents="none"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}
