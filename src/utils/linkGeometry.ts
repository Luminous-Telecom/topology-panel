/** Geometria de links — path reto ou com waypoints para desviar obstáculos. */

import { TopologyLink } from '../types';
import { linkKey, linksMatchEndpoints } from './mapLinkEdits';

export interface LinkPoint {
  x: number;
  y: number;
}

export interface LinkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LinkGeometry {
  d: string;
  start: LinkPoint;
  end: LinkPoint;
  waypoints: LinkPoint[];
  pathPoints: LinkPoint[];
}

function nodeCenter(node: LinkBox): LinkPoint {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function nodeEdgeToward(node: LinkBox, toward: LinkPoint): LinkPoint {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? node.x + node.w : node.x, y: cy };
  }
  return { x: cx, y: dy >= 0 ? node.y + node.h : node.y };
}

function snapLinkEndpoint(
  start: LinkPoint,
  end: LinkPoint,
  gridStep: number
): LinkPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const threshold = Math.max(6, gridStep * 0.55);
  if (Math.abs(dx) <= threshold && Math.abs(dy) > threshold) {
    return { x: start.x, y: end.y };
  }
  if (Math.abs(dy) <= threshold && Math.abs(dx) > threshold) {
    return { x: end.x, y: start.y };
  }
  return end;
}

function pathToD(points: LinkPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/** Polilinha com cantos arredondados nos waypoints (Q = curva suave no vértice). */
function pathToRoundedD(points: LinkPoint[], radius: number): string {
  if (points.length < 2) {
    return '';
  }
  if (points.length === 2) {
    return pathToD(points);
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inDx = corner.x - prev.x;
    const inDy = corner.y - prev.y;
    const outDx = next.x - corner.x;
    const outDy = next.y - corner.y;
    const inLen = Math.hypot(inDx, inDy);
    const outLen = Math.hypot(outDx, outDy);
    if (inLen === 0 || outLen === 0) {
      parts.push(`L ${corner.x} ${corner.y}`);
      continue;
    }

    const r = Math.min(radius, inLen / 2, outLen / 2);
    const startCurve = {
      x: corner.x - (inDx / inLen) * r,
      y: corner.y - (inDy / inLen) * r,
    };
    const endCurve = {
      x: corner.x + (outDx / outLen) * r,
      y: corner.y + (outDy / outLen) * r,
    };
    parts.push(`L ${startCurve.x} ${startCurve.y}`);
    parts.push(`Q ${corner.x} ${corner.y} ${endCurve.x} ${endCurve.y}`);
  }

  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

/** Raio de canto (8–16px) para os cotovelos de um link com waypoints, escalado pelo grid. */
function linkCornerRadius(gridStep: number): number {
  return Math.min(16, Math.max(8, gridStep * 1.2));
}

export function computeLinkGeometry(
  from: LinkBox,
  to: LinkBox,
  gridStep: number,
  waypoints: LinkPoint[] = []
): LinkGeometry {
  const start = nodeCenter(from);
  const wps = waypoints.map((p) => ({ x: p.x, y: p.y }));
  const end =
    wps.length > 0
      ? nodeEdgeToward(to, wps[wps.length - 1])
      : snapLinkEndpoint(start, nodeEdgeToward(to, start), gridStep);
  const pathPoints = [start, ...wps, end];
  const d = wps.length > 0 ? pathToRoundedD(pathPoints, linkCornerRadius(gridStep)) : pathToD(pathPoints);
  return { d, start, end, waypoints: wps, pathPoints };
}

function projectPointOnSegment(p: LinkPoint, a: LinkPoint, b: LinkPoint): LinkPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return { x: a.x, y: a.y };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Ponto mais próximo na polilinha e índice onde inserir novo waypoint. */
export function closestPointOnPolyline(
  pathPoints: LinkPoint[],
  point: LinkPoint
): { x: number; y: number; distance: number; insertIndex: number } {
  let best = { distance: Infinity, x: point.x, y: point.y, insertIndex: 0 };
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const proj = projectPointOnSegment(point, pathPoints[i], pathPoints[i + 1]);
    const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
    if (dist < best.distance) {
      best = { distance: dist, x: proj.x, y: proj.y, insertIndex: i };
    }
  }
  return best;
}

/** Waypoint mais próximo de um ponto (para arrastar/remover sem handle visível). */
export function nearestWaypointIndex(
  waypoints: LinkPoint[],
  point: LinkPoint,
  maxDistance: number
): number {
  let bestIndex = -1;
  let bestDist = maxDistance;
  for (let i = 0; i < waypoints.length; i++) {
    const dist = Math.hypot(point.x - waypoints[i].x, point.y - waypoints[i].y);
    if (dist <= bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Desloca a polilinha perpendicularmente (px) — faixas RX/TX e cabos paralelos. */
export function offsetPolyline(points: LinkPoint[], offset: number): LinkPoint[] {
  if (points.length < 2 || offset === 0) {
    return points.map((p) => ({ ...p }));
  }

  return points.map((point, i) => {
    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = points[1].x - points[0].x;
      dy = points[1].y - points[0].y;
    } else if (i === points.length - 1) {
      dx = points[i].x - points[i - 1].x;
      dy = points[i].y - points[i - 1].y;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dy = points[i + 1].y - points[i - 1].y;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return { x: point.x + nx * offset, y: point.y + ny * offset };
  });
}

export function buildLinkPathD(
  pathPoints: LinkPoint[],
  gridStep: number,
  hasWaypoints: boolean,
  offset = 0
): string {
  const pts = offset === 0 ? pathPoints : offsetPolyline(pathPoints, offset);
  return hasWaypoints ? pathToRoundedD(pts, linkCornerRadius(gridStep)) : pathToD(pts);
}

function segmentAngle(a: LinkPoint, b: LinkPoint): number {
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) {
    angle += 180;
  }
  return angle;
}

/** Rótulo de capacidade no meio visual da linha (projetado sobre o path). */
export function linkLabelAnchor(
  pathPoints: LinkPoint[],
  from?: LinkBox,
  to?: LinkBox
): { x: number; y: number; angle: number } {
  if (pathPoints.length < 2) {
    return { x: 0, y: 0, angle: 0 };
  }

  const anchorTarget =
    from && to
      ? nodeCenter(from)
      : pathPoints[0];
  const anchorTargetEnd =
    from && to
      ? nodeCenter(to)
      : pathPoints[pathPoints.length - 1];

  const betweenNodes = {
    x: (anchorTarget.x + anchorTargetEnd.x) / 2,
    y: (anchorTarget.y + anchorTargetEnd.y) / 2,
  };

  const onPath = closestPointOnPolyline(pathPoints, betweenNodes);
  const a = pathPoints[onPath.insertIndex];
  const b = pathPoints[onPath.insertIndex + 1];
  return { x: onPath.x, y: onPath.y, angle: segmentAngle(a, b) };
}

const PARALLEL_LINK_SPACING = 12;

/**
 * Deslocamento perpendicular para cabos que compartilham o mesmo par de nós.
 * Um cabo sozinho fica na linha original (offset 0).
 */
export function parallelLinkBundleOffset(link: TopologyLink, links: TopologyLink[]): number {
  const group = links.filter((item) => linksMatchEndpoints(item, link));
  if (group.length <= 1) {
    return 0;
  }
  const sorted = [...group].sort((a, b) => linkKey(a).localeCompare(linkKey(b)));
  const index = sorted.findIndex((item) => linkKey(item) === linkKey(link));
  if (index < 0) {
    return 0;
  }
  return (index - (sorted.length - 1) / 2) * PARALLEL_LINK_SPACING;
}
