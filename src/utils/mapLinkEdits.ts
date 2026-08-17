/** Criação, edição e remoção de cabos do mapa salvo. */
import { TopologyLink, TopologyMap } from '../types';
import { inferLinkMedium } from './linkMedium';
import { findNodeById } from './topologyNodes';

/** Compara endpoints de link sem considerar direção (a→b é o mesmo link que b→a). */
export function linksMatchEndpoints(
  a: { from: string; to: string },
  b: { from: string; to: string }
): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
}

/** Chave estável de um link (direção original a→b) — usada para seleção/hover/lookup por identidade. */
export function linkKey(link: { from: string; to: string }): string {
  return `${link.from}-${link.to}`;
}

export function addLinkToMap(map: TopologyMap, from: string, to: string): TopologyMap {
  if (from === to) {
    return map;
  }
  const exists = map.links.some((l) => linksMatchEndpoints(l, { from, to }));
  if (exists) {
    return map;
  }
  const fromNode = findNodeById(map.nodes, from);
  const toNode = findNodeById(map.nodes, to);
  return {
    ...map,
    links: [...map.links, { from, to, medium: inferLinkMedium(fromNode, toNode) }],
  };
}

export function updateLinkProps(
  map: TopologyMap,
  from: string,
  to: string,
  patch: Partial<Pick<TopologyLink, 'medium' | 'bandwidthMbps' | 'waypoints'>>
): TopologyMap {
  return {
    ...map,
    links: map.links.map((l) => {
      if (!linksMatchEndpoints(l, { from, to })) {
        return l;
      }
      const next = { ...l, ...patch };
      if (patch.bandwidthMbps === undefined && Object.prototype.hasOwnProperty.call(patch, 'bandwidthMbps')) {
        delete next.bandwidthMbps;
      }
      if (patch.waypoints !== undefined && (!patch.waypoints || patch.waypoints.length === 0)) {
        delete next.waypoints;
      }
      return next;
    }),
  };
}

export function removeLinkByEndpoints(map: TopologyMap, from: string, to: string): TopologyMap {
  return {
    ...map,
    links: map.links.filter((l) => !linksMatchEndpoints(l, { from, to })),
  };
}
