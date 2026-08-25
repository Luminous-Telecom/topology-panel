/** Criação, edição e remoção de cabos do mapa salvo. */
import { TopologyInterfaceReference, TopologyLink, TopologyLinkPeerHost, TopologyMap } from '../types';
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
  return addLinkWithInterfaces(map, from, to);
}

export interface AddLinkWithInterfacesOptions {
  fromInterface?: TopologyInterfaceReference;
  toInterface?: TopologyInterfaceReference;
  fromPeerHost?: TopologyLinkPeerHost;
  toPeerHost?: TopologyLinkPeerHost;
  bandwidthMbps?: number;
  discovery?: TopologyLink['discovery'];
}

/**
 * Cria o cabo ou atualiza interfaces/peers se os extremos já existem (qualquer direção).
 * Não cria segundo cabo entre o mesmo par — o mapa só admite um.
 */
export function upsertLinkWithInterfaces(
  map: TopologyMap,
  from: string,
  to: string,
  options: AddLinkWithInterfacesOptions = {}
): TopologyMap {
  const existing = map.links.find((link) => linksMatchEndpoints(link, { from, to }));
  if (!existing) {
    return addLinkWithInterfaces(map, from, to, options);
  }
  const sameDirection = existing.from === from && existing.to === to;
  const patch: Parameters<typeof updateLinkProps>[3] = {};
  const fromInterface = sameDirection ? options.fromInterface : options.toInterface;
  const toInterface = sameDirection ? options.toInterface : options.fromInterface;
  const fromPeerHost = sameDirection ? options.fromPeerHost : options.toPeerHost;
  const toPeerHost = sameDirection ? options.toPeerHost : options.fromPeerHost;
  if (fromInterface) {
    patch.fromInterface = fromInterface;
  }
  if (toInterface) {
    patch.toInterface = toInterface;
  }
  if (fromPeerHost) {
    patch.fromPeerHost = fromPeerHost;
  }
  if (toPeerHost) {
    patch.toPeerHost = toPeerHost;
  }
  if (options.bandwidthMbps && options.bandwidthMbps > 0) {
    patch.bandwidthMbps = options.bandwidthMbps;
  }
  return updateLinkProps(map, existing.from, existing.to, patch);
}

export function addLinkWithInterfaces(
  map: TopologyMap,
  from: string,
  to: string,
  options: AddLinkWithInterfacesOptions = {}
): TopologyMap {
  if (from === to) {
    return map;
  }
  const exists = map.links.some((l) => linksMatchEndpoints(l, { from, to }));
  if (exists) {
    return map;
  }
  const fromNode = findNodeById(map.nodes, from);
  const toNode = findNodeById(map.nodes, to);
  const link: TopologyLink = {
    from,
    to,
    medium: inferLinkMedium(fromNode, toNode),
    discovery: options.discovery ?? { source: 'manual', state: 'confirmed', confirmed: true },
  };
  if (options.fromInterface) {
    link.fromInterface = options.fromInterface;
  }
  if (options.toInterface) {
    link.toInterface = options.toInterface;
  }
  if (options.fromPeerHost) {
    link.fromPeerHost = options.fromPeerHost;
  }
  if (options.toPeerHost) {
    link.toPeerHost = options.toPeerHost;
  }
  if (options.bandwidthMbps && options.bandwidthMbps > 0) {
    link.bandwidthMbps = options.bandwidthMbps;
  }
  return {
    ...map,
    links: [...map.links, link],
  };
}

export function updateLinkProps(
  map: TopologyMap,
  from: string,
  to: string,
  patch: Partial<
    Pick<
      TopologyLink,
      | 'medium'
      | 'bandwidthMbps'
      | 'waypoints'
      | 'fromInterface'
      | 'toInterface'
      | 'fromPeerHost'
      | 'toPeerHost'
      | 'style'
      | 'discovery'
    >
  >
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
      if (Object.prototype.hasOwnProperty.call(patch, 'fromPeerHost') && !patch.fromPeerHost) {
        delete next.fromPeerHost;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'toPeerHost') && !patch.toPeerHost) {
        delete next.toPeerHost;
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
