/** Criação, edição e remoção de cabos do mapa salvo. */
import { TopologyInterfaceReference, TopologyLink, TopologyLinkPeerHost, TopologyMap } from '../types';
import { inferLinkMedium } from './linkMedium';
import { findNodeById } from './topologyNodes';

/** Compara endpoints de link sem considerar direção (a→b é o mesmo par que b→a). */
export function linksMatchEndpoints(
  a: { from: string; to: string },
  b: { from: string; to: string }
): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
}

function interfaceKey(ref?: TopologyInterfaceReference): string {
  const name = ref?.name?.trim() ?? '';
  const index = ref?.snmpIndex?.trim() ?? '';
  return index ? `${name}#${index}` : name;
}

function peerKey(peer?: TopologyLinkPeerHost): string {
  return peer?.nodeId?.trim() || peer?.zabbixHost?.trim() || '';
}

/** Chave estável de um cabo (direção original + interfaces + peers). */
export function linkKey(link: TopologyLink): string {
  return [
    link.from,
    interfaceKey(link.fromInterface),
    peerKey(link.fromPeerHost),
    link.to,
    interfaceKey(link.toInterface),
    peerKey(link.toPeerHost),
  ].join('\x1f');
}

export function sameInterface(
  a?: TopologyInterfaceReference,
  b?: TopologyInterfaceReference
): boolean {
  if (!a?.name?.trim() || !b?.name?.trim()) {
    return false;
  }
  if (a.name.trim() !== b.name.trim()) {
    return false;
  }
  const indexA = a.snmpIndex?.trim();
  const indexB = b.snmpIndex?.trim();
  if (indexA && indexB) {
    return indexA === indexB;
  }
  return true;
}

export function samePeer(a?: TopologyLinkPeerHost, b?: TopologyLinkPeerHost): boolean {
  if (!a || !b) {
    return false;
  }
  if (a.nodeId && b.nodeId && a.nodeId === b.nodeId) {
    return true;
  }
  const keyA = a.zabbixHost?.trim();
  const keyB = b.zabbixHost?.trim();
  return Boolean(keyA && keyB && keyA === keyB);
}

function hasInterface(ref?: TopologyInterfaceReference): boolean {
  return Boolean(ref?.name?.trim());
}

function fieldConflicts<T>(
  linkField: T | undefined,
  connField: T | undefined,
  same: (left: T, right: T) => boolean
): boolean {
  if (!linkField || !connField) {
    return false;
  }
  return !same(linkField, connField);
}

/**
 * O cabo é a mesma conexão se nenhum campo identifica outra (interface/peer diferentes)
 * e, quando o cabo tem identidade, ela coincide com a proposta.
 */
export function hopFieldsMatch(
  linkPeerA: TopologyLinkPeerHost | undefined,
  connPeerA: TopologyLinkPeerHost | undefined,
  linkIfaceA: TopologyInterfaceReference | undefined,
  connIfaceA: TopologyInterfaceReference | undefined,
  linkPeerB: TopologyLinkPeerHost | undefined,
  connPeerB: TopologyLinkPeerHost | undefined,
  linkIfaceB: TopologyInterfaceReference | undefined,
  connIfaceB: TopologyInterfaceReference | undefined
): boolean {
  if (fieldConflicts(linkPeerA, connPeerA, samePeer)) {
    return false;
  }
  if (fieldConflicts(linkPeerB, connPeerB, samePeer)) {
    return false;
  }
  if (fieldConflicts(linkIfaceA, connIfaceA, sameInterface)) {
    return false;
  }
  if (fieldConflicts(linkIfaceB, connIfaceB, sameInterface)) {
    return false;
  }
  if (!linkPeerA && !linkPeerB && !hasInterface(linkIfaceA) && !hasInterface(linkIfaceB)) {
    return true;
  }
  return (
    samePeer(linkPeerA, connPeerA) ||
    samePeer(linkPeerB, connPeerB) ||
    sameInterface(linkIfaceA, connIfaceA) ||
    sameInterface(linkIfaceB, connIfaceB)
  );
}

function orientedHopMatch(stored: TopologyLink, proposed: TopologyLink): boolean {
  const sameDir = stored.from === proposed.from && stored.to === proposed.to;
  return hopFieldsMatch(
    sameDir ? stored.fromPeerHost : stored.toPeerHost,
    proposed.fromPeerHost,
    sameDir ? stored.fromInterface : stored.toInterface,
    proposed.fromInterface,
    sameDir ? stored.toPeerHost : stored.fromPeerHost,
    proposed.toPeerHost,
    sameDir ? stored.toInterface : stored.fromInterface,
    proposed.toInterface
  );
}

/** Mesmo par de nós e mesma conexão lógica (interfaces/peers compatíveis, qualquer direção). */
export function linksMatchConnection(a: TopologyLink, b: TopologyLink): boolean {
  return linksMatchEndpoints(a, b) && orientedHopMatch(a, b);
}

function identityInterfaceEquals(
  a?: TopologyInterfaceReference,
  b?: TopologyInterfaceReference
): boolean {
  const aName = a?.name?.trim() ?? '';
  const bName = b?.name?.trim() ?? '';
  if (!aName && !bName) {
    return true;
  }
  return sameInterface(a, b);
}

function identityPeerEquals(a?: TopologyLinkPeerHost, b?: TopologyLinkPeerHost): boolean {
  if (!a && !b) {
    return true;
  }
  return samePeer(a, b);
}

/** Mesmo cabo persistido: extremos + interfaces + peers, incluindo direção invertida. */
export function linksMatchIdentity(a: TopologyLink, b: TopologyLink): boolean {
  if (a.from === b.from && a.to === b.to) {
    return (
      identityInterfaceEquals(a.fromInterface, b.fromInterface) &&
      identityInterfaceEquals(a.toInterface, b.toInterface) &&
      identityPeerEquals(a.fromPeerHost, b.fromPeerHost) &&
      identityPeerEquals(a.toPeerHost, b.toPeerHost)
    );
  }
  if (a.from === b.to && a.to === b.from) {
    return (
      identityInterfaceEquals(a.fromInterface, b.toInterface) &&
      identityInterfaceEquals(a.toInterface, b.fromInterface) &&
      identityPeerEquals(a.fromPeerHost, b.toPeerHost) &&
      identityPeerEquals(a.toPeerHost, b.fromPeerHost)
    );
  }
  return false;
}

function linkHasIdentity(link: TopologyLink): boolean {
  return (
    hasInterface(link.fromInterface) ||
    hasInterface(link.toInterface) ||
    Boolean(link.fromPeerHost) ||
    Boolean(link.toPeerHost)
  );
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
  medium?: TopologyLink['medium'];
  waypoints?: TopologyLink['waypoints'];
}

function proposedLink(
  from: string,
  to: string,
  options: AddLinkWithInterfacesOptions
): TopologyLink {
  return {
    from,
    to,
    fromInterface: options.fromInterface,
    toInterface: options.toInterface,
    fromPeerHost: options.fromPeerHost,
    toPeerHost: options.toPeerHost,
  };
}

function findExistingConnection(
  map: TopologyMap,
  from: string,
  to: string,
  options: AddLinkWithInterfacesOptions
): TopologyLink | undefined {
  const proposed = proposedLink(from, to, options);
  return map.links.find((link) => linksMatchConnection(link, proposed));
}

/**
 * Cria o cabo ou atualiza interfaces/peers se a mesma conexão já existe (qualquer direção).
 * Cabos paralelos entre o mesmo par (interfaces ou hosts internos diferentes) são cabos novos.
 */
export function upsertLinkWithInterfaces(
  map: TopologyMap,
  from: string,
  to: string,
  options: AddLinkWithInterfacesOptions = {}
): TopologyMap {
  const existing = findExistingConnection(map, from, to, options);
  if (!existing) {
    return addLinkWithInterfaces(map, from, to, options);
  }
  const sameDirection = existing.from === from && existing.to === to;
  const patch: Parameters<typeof updateLinkProps>[2] = {};
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
  return updateLinkProps(map, existing, patch);
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
  const proposed = proposedLink(from, to, options);
  const duplicate = linkHasIdentity(proposed)
    ? map.links.some((link) => linksMatchConnection(link, proposed))
    : map.links.some((link) => linksMatchEndpoints(link, proposed));
  if (duplicate) {
    return map;
  }
  const fromNode = findNodeById(map.nodes, from);
  const toNode = findNodeById(map.nodes, to);
  const link: TopologyLink = {
    from,
    to,
    medium: options.medium ?? inferLinkMedium(fromNode, toNode),
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
  if (options.waypoints && options.waypoints.length > 0) {
    link.waypoints = options.waypoints;
  }
  return {
    ...map,
    links: [...map.links, link],
  };
}

export function updateLinkProps(
  map: TopologyMap,
  target: TopologyLink,
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
      if (!linksMatchIdentity(l, target)) {
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

/** Remove só o cabo da mesma identidade (não os paralelos entre o mesmo par). */
export function removeLink(map: TopologyMap, target: TopologyLink): TopologyMap {
  return {
    ...map,
    links: map.links.filter((l) => !linksMatchIdentity(l, target)),
  };
}

/** Remove todos os cabos entre os dois nós (qualquer identidade). */
export function removeLinkByEndpoints(map: TopologyMap, from: string, to: string): TopologyMap {
  return {
    ...map,
    links: map.links.filter((l) => !linksMatchEndpoints(l, { from, to })),
  };
}
