import React, { useCallback, useMemo, useRef } from 'react';
import { TopologyLink, TopologyMap, TopologyNode, TopologyView } from '../types';
import { NodeLayout } from '../utils/nodeLayout';
import { computeTopologyContentBounds, isNetworkNode } from '../utils/mapBounds';
import { overlayCardStyle } from './chrome/overlayChrome';
import styles from './TopologyMinimap.module.scss';

const MINI_WIDTH = 196;
const MINI_HEIGHT = 148;
const MINI_PAD = 6;

interface Props {
  map: TopologyMap;
  nodes: TopologyNode[];
  links: TopologyLink[];
  nodeLayouts: Map<string, NodeLayout & TopologyNode>;
  view: TopologyView;
  viewport: { w: number; h: number };
  onViewChange: (view: TopologyView) => void;
  resolveNodeFill: (node: TopologyNode) => string;
  resolveNetworkStroke: (node: TopologyNode) => string;
  linkColor: string;
}

function viewCenterOnMapPoint(
  view: TopologyView,
  viewport: { w: number; h: number },
  mapX: number,
  mapY: number
): TopologyView {
  return {
    scale: view.scale,
    x: viewport.w / 2 - mapX * view.scale,
    y: viewport.h / 2 - mapY * view.scale,
  };
}

export function TopologyMinimap({
  map,
  nodes,
  links,
  nodeLayouts,
  view,
  viewport,
  onViewChange,
  resolveNodeFill,
  resolveNetworkStroke,
  linkColor,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const bounds = useMemo(
    () => computeTopologyContentBounds(map, nodeLayouts),
    [map, nodeLayouts]
  );

  const miniScale = useMemo(() => {
    const innerW = MINI_WIDTH - MINI_PAD * 2;
    const innerH = MINI_HEIGHT - MINI_PAD * 2;
    return Math.min(innerW / bounds.width, innerH / bounds.height);
  }, [bounds.height, bounds.width]);

  const toMini = useCallback(
    (mapX: number, mapY: number) => ({
      x: MINI_PAD + (mapX - bounds.x0) * miniScale,
      y: MINI_PAD + (mapY - bounds.y0) * miniScale,
    }),
    [bounds.x0, bounds.y0, miniScale]
  );

  const mapFromClient = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const el = wrapRef.current;
      if (!el || miniScale <= 0) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      return {
        x: bounds.x0 + (px - MINI_PAD) / miniScale,
        y: bounds.y0 + (py - MINI_PAD) / miniScale,
      };
    },
    [bounds.x0, bounds.y0, miniScale]
  );

  const panToClient = useCallback(
    (clientX: number, clientY: number) => {
      const point = mapFromClient(clientX, clientY);
      if (!point) {
        return;
      }
      onViewChange(viewCenterOnMapPoint(view, viewport, point.x, point.y));
    },
    [mapFromClient, onViewChange, view, viewport]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      panToClient(e.clientX, e.clientY);
    },
    [panToClient]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) {
        return;
      }
      e.preventDefault();
      panToClient(e.clientX, e.clientY);
    },
    [panToClient]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const viewportRect = useMemo(() => {
    if (viewport.w <= 0 || viewport.h <= 0 || view.scale <= 0) {
      return null;
    }
    const x0 = -view.x / view.scale;
    const y0 = -view.y / view.scale;
    const x1 = (viewport.w - view.x) / view.scale;
    const y1 = (viewport.h - view.y) / view.scale;
    const topLeft = toMini(x0, y0);
    const bottomRight = toMini(x1, y1);
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: Math.max(bottomRight.x - topLeft.x, 2),
      h: Math.max(bottomRight.y - topLeft.y, 2),
    };
  }, [toMini, view.scale, view.x, view.y, viewport.h, viewport.w]);

  const networkNodes = nodes.filter((node) => isNetworkNode(node));
  const otherNodes = nodes.filter((node) => !isNetworkNode(node));

  return (
    <div
      ref={wrapRef}
      className={`${overlayCardStyle} ${styles.wrap}`}
      title="Visão geral — arraste para mover o mapa"
      aria-label="Visão geral do mapa"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg width={MINI_WIDTH} height={MINI_HEIGHT} aria-hidden>
        <rect x={0} y={0} width={MINI_WIDTH} height={MINI_HEIGHT} fill="rgba(17,18,23,0.95)" />
        {networkNodes.map((node) => {
          const layout = nodeLayouts.get(node.id);
          if (!layout) {
            return null;
          }
          const topLeft = toMini(layout.x, layout.y);
          return (
            <rect
              key={`net-${node.id}`}
              x={topLeft.x}
              y={topLeft.y}
              width={Math.max(layout.w * miniScale, 2)}
              height={Math.max(layout.h * miniScale, 2)}
              fill={resolveNodeFill(node)}
              fillOpacity={0.35}
              stroke={resolveNetworkStroke(node)}
              strokeWidth={0.75}
            />
          );
        })}
        {links.map((link, index) => {
          const from = nodeLayouts.get(link.from);
          const to = nodeLayouts.get(link.to);
          if (!from || !to || isNetworkNode(from) || isNetworkNode(to)) {
            return null;
          }
          const a = toMini(from.x + from.w / 2, from.y + from.h / 2);
          const b = toMini(to.x + to.w / 2, to.y + to.h / 2);
          return (
            <line
              key={`link-${link.from}-${link.to}-${index}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={linkColor}
              strokeWidth={1}
              strokeOpacity={0.72}
              strokeLinecap="round"
            />
          );
        })}
        {otherNodes.map((node) => {
          const layout = nodeLayouts.get(node.id);
          if (!layout) {
            return null;
          }
          const topLeft = toMini(layout.x, layout.y);
          const fill = resolveNodeFill(node);
          return (
            <rect
              key={`node-${node.id}`}
              x={topLeft.x}
              y={topLeft.y}
              width={Math.max(layout.w * miniScale, 2)}
              height={Math.max(layout.h * miniScale, 2)}
              fill={fill}
              rx={node.type === 'submap' || node.type === 'dashboard_picker' ? 1 : 0}
            />
          );
        })}
        {viewportRect ? (
          <rect
            x={viewportRect.x}
            y={viewportRect.y}
            width={viewportRect.w}
            height={viewportRect.h}
            fill="rgba(79, 195, 247, 0.12)"
            stroke="#4FC3F7"
            strokeWidth={1.25}
            pointerEvents="none"
          />
        ) : null}
      </svg>
    </div>
  );
}
