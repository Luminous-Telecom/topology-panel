import { TopologyInterfaceReference, TopologyLink, TopologyLinkPeerHost, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { activeChildMaps } from './childMapEdits';
import { linksMatchEndpoints, removeLinkByEndpoints, upsertLinkWithInterfaces } from './mapLinkEdits';
import {
  counterpartSubmapBoxScore,
  findCounterpartSubmapBoxes,
  findSubmapNodeByChildMapId,
  linkPeerHostFromNode,
  pickCounterpartSubmapBox,
  resolveInnerHost,
} from './submapHosts';
import { applyTopologyMapToPanelOptions, ROOT_MAP_ID, resolveTopologyMapById } from './topologyMapNavigation';
import { findNodeById, isHostNode, submapHasChildMapId } from './topologyNodes';

interface InterSubmapConnection {
  mapIdA: string;
  mapIdB: string;
  hostA?: TopologyLinkPeerHost;
  hostB?: TopologyLinkPeerHost;
  interfaceA?: TopologyInterfaceReference;
  interfaceB?: TopologyInterfaceReference;
  bandwidthMbps?: number;
}

function childMapIdOf(node: TopologyNode | undefined): string | undefined {
  const id = node?.submapChildMapId?.trim();
  return id || undefined;
}

function hostNodes(map: TopologyMap): TopologyNode[] {
  return map.nodes.filter(isHostNode);
}

/**
 * Cabo que liga dois mapas internos: host deste mapa ↔ caixa do outro, ou duas caixas de submapa
 * (raiz) com host interno em cada lado.
 */
export function describeInterSubmapConnection(
  currentMapId: string,
  map: TopologyMap,
  link: TopologyLink
): InterSubmapConnection | undefined {
  const fromNode = findNodeById(map.nodes, link.from);
  const toNode = findNodeById(map.nodes, link.to);
  if (!fromNode || !toNode) {
    return undefined;
  }

  const fromChildId = submapHasChildMapId(fromNode) ? childMapIdOf(fromNode) : undefined;
  const toChildId = submapHasChildMapId(toNode) ? childMapIdOf(toNode) : undefined;

  if (fromChildId && toChildId && fromChildId !== toChildId) {
    return {
      mapIdA: fromChildId,
      mapIdB: toChildId,
      hostA: link.fromPeerHost,
      hostB: link.toPeerHost,
      interfaceA: link.fromInterface,
      interfaceB: link.toInterface,
      bandwidthMbps: link.bandwidthMbps,
    };
  }

  if (currentMapId === ROOT_MAP_ID) {
    return undefined;
  }

  if (isHostNode(fromNode) && toChildId && toChildId !== currentMapId) {
    return {
      mapIdA: currentMapId,
      mapIdB: toChildId,
      hostA: linkPeerHostFromNode(fromNode),
      hostB: link.toPeerHost,
      interfaceA: link.fromInterface,
      interfaceB: link.toInterface,
      bandwidthMbps: link.bandwidthMbps,
    };
  }

  if (isHostNode(toNode) && fromChildId && fromChildId !== currentMapId) {
    return {
      mapIdA: fromChildId,
      mapIdB: currentMapId,
      hostA: link.fromPeerHost,
      hostB: linkPeerHostFromNode(toNode),
      interfaceA: link.fromInterface,
      interfaceB: link.toInterface,
      bandwidthMbps: link.bandwidthMbps,
    };
  }

  return undefined;
}

function listPanelMaps(options: TopologyPanelOptions): Array<{ mapId: string; map: TopologyMap }> {
  return [
    { mapId: ROOT_MAP_ID, map: options.map },
    ...Object.entries(activeChildMaps(options.childMaps)).map(([mapId, map]) => ({ mapId, map })),
  ];
}

function findOverviewWithBothBoxes(
  options: TopologyPanelOptions,
  mapIdA: string,
  mapIdB: string
): { mapId: string; map: TopologyMap; boxA: TopologyNode; boxB: TopologyNode } | undefined {
  for (const entry of listPanelMaps(options)) {
    const boxA = findSubmapNodeByChildMapId(entry.map, mapIdA);
    const boxB = findSubmapNodeByChildMapId(entry.map, mapIdB);
    if (boxA && boxB && boxA.id !== boxB.id) {
      return { ...entry, boxA, boxB };
    }
  }
  return undefined;
}

function writeMap(
  options: TopologyPanelOptions,
  mapId: string,
  map: TopologyMap
): TopologyPanelOptions {
  return applyTopologyMapToPanelOptions(options, mapId, map);
}

function findLocalHost(map: TopologyMap, peer?: TopologyLinkPeerHost): TopologyNode | undefined {
  if (!peer) {
    return undefined;
  }
  const byId = findNodeById(map.nodes, peer.nodeId);
  if (byId && isHostNode(byId)) {
    return byId;
  }
  return resolveInnerHost(hostNodes(map), peer);
}

function upsertInnerHop(
  options: TopologyPanelOptions,
  localMapId: string,
  remoteMapId: string,
  localHost: TopologyLinkPeerHost | undefined,
  remoteHost: TopologyLinkPeerHost | undefined,
  localInterface: TopologyInterfaceReference | undefined,
  remoteInterface: TopologyInterfaceReference | undefined,
  bandwidthMbps: number | undefined,
  skipMapId: string,
  localIsOrigin: boolean
): TopologyPanelOptions {
  if (localMapId === skipMapId || !localHost) {
    return options;
  }
  const map = resolveTopologyMapById(options, localMapId);
  if (!map) {
    return options;
  }
  const boxes = findCounterpartSubmapBoxes(map, remoteMapId);
  const host = findLocalHost(map, localHost);
  if (!boxes.length || !host) {
    return options;
  }
  const regionLabel = findSubmapNodeByChildMapId(options.map, remoteMapId)?.label;
  const preferred = pickCounterpartSubmapBox(boxes, remoteMapId, regionLabel) ?? boxes[0];
  const existing = map.links.find((link) => {
    const other = link.from === host.id ? link.to : link.to === host.id ? link.from : undefined;
    return Boolean(other && boxes.some((box) => box.id === other));
  });

  let working = map;
  let box = preferred;
  if (existing) {
    const existingBoxId = existing.from === host.id ? existing.to : existing.from;
    const existingBox = boxes.find((item) => item.id === existingBoxId);
    const existingScore = existingBox
      ? counterpartSubmapBoxScore(existingBox, remoteMapId, regionLabel)
      : 0;
    const preferredScore = counterpartSubmapBoxScore(preferred, remoteMapId, regionLabel);
    if (existingBoxId !== preferred.id && preferredScore > existingScore) {
      working = removeLinkByEndpoints(map, existing.from, existing.to);
      box = preferred;
    } else if (existingBox) {
      box = existingBox;
    }
  }

  const desiredFrom = localIsOrigin ? host.id : box.id;
  const desiredTo = localIsOrigin ? box.id : host.id;
  if (existing && (existing.from !== desiredFrom || existing.to !== desiredTo)) {
    working = removeLinkByEndpoints(working, existing.from, existing.to);
  }

  const hop = localIsOrigin
    ? {
        fromInterface: localInterface,
        toInterface: remoteInterface,
        toPeerHost: remoteHost,
        bandwidthMbps,
      }
    : {
        fromInterface: remoteInterface,
        toInterface: localInterface,
        fromPeerHost: remoteHost,
        bandwidthMbps,
      };

  return writeMap(
    options,
    localMapId,
    upsertLinkWithInterfaces(working, desiredFrom, desiredTo, hop)
  );
}

/**
 * Espelha o cabo entre dois submapas: caixa→caixa no mapa que contém as duas (em geral a raiz)
 * e, em cada mapa interno, o hop na direção da seta (origem: host→caixa; destino: caixa→host).
 * Não cria nós — só cabo entre nós que já existem. O mapa em que o usuário acabou de gravar o
 * cabo não é reescrito.
 */
export function syncInterSubmapCounterpartLinks(
  options: TopologyPanelOptions,
  currentMapId: string,
  link: TopologyLink
): TopologyPanelOptions {
  const currentMap = resolveTopologyMapById(options, currentMapId);
  if (!currentMap) {
    return options;
  }
  const conn = describeInterSubmapConnection(currentMapId, currentMap, link);
  if (!conn) {
    return options;
  }

  let next = options;
  const overview = findOverviewWithBothBoxes(next, conn.mapIdA, conn.mapIdB);
  if (overview && overview.mapId !== currentMapId) {
    next = writeMap(
      next,
      overview.mapId,
      upsertLinkWithInterfaces(overview.map, overview.boxA.id, overview.boxB.id, {
        fromPeerHost: conn.hostA,
        toPeerHost: conn.hostB,
        fromInterface: conn.interfaceA,
        toInterface: conn.interfaceB,
        bandwidthMbps: conn.bandwidthMbps,
      })
    );
  }

  next = upsertInnerHop(
    next,
    conn.mapIdA,
    conn.mapIdB,
    conn.hostA,
    conn.hostB,
    conn.interfaceA,
    conn.interfaceB,
    conn.bandwidthMbps,
    currentMapId,
    true
  );
  next = upsertInnerHop(
    next,
    conn.mapIdB,
    conn.mapIdA,
    conn.hostB,
    conn.hostA,
    conn.interfaceB,
    conn.interfaceA,
    conn.bandwidthMbps,
    currentMapId,
    false
  );
  return next;
}

function sameInterface(
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

function samePeer(a?: TopologyLinkPeerHost, b?: TopologyLinkPeerHost): boolean {
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

function hasInterface(ref?: TopologyInterfaceReference): boolean {
  return Boolean(ref?.name?.trim());
}

/**
 * O hop é o espelho desta conexão se nenhum campo identifica outra (interface/peer diferentes)
 * e, quando o hop tem identidade, ela coincide com a conexão excluída.
 */
function hopFieldsMatch(
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

function linkConnectsSets(link: TopologyLink, setA: Set<string>, setB: Set<string>): boolean {
  return (setA.has(link.from) && setB.has(link.to)) || (setB.has(link.from) && setA.has(link.to));
}

function otherEndpoint(link: TopologyLink, nodeId: string): string | undefined {
  if (link.from === nodeId) {
    return link.to;
  }
  if (link.to === nodeId) {
    return link.from;
  }
  return undefined;
}

function boxIdsOf(map: TopologyMap, childMapId: string): Set<string> {
  return new Set(findCounterpartSubmapBoxes(map, childMapId).map((box) => box.id));
}

function overviewHopMatches(
  link: TopologyLink,
  idsA: Set<string>,
  idsB: Set<string>,
  conn: InterSubmapConnection
): boolean {
  if (!linkConnectsSets(link, idsA, idsB)) {
    return false;
  }
  const aIsFrom = idsA.has(link.from);
  return hopFieldsMatch(
    aIsFrom ? link.fromPeerHost : link.toPeerHost,
    conn.hostA,
    aIsFrom ? link.fromInterface : link.toInterface,
    conn.interfaceA,
    aIsFrom ? link.toPeerHost : link.fromPeerHost,
    conn.hostB,
    aIsFrom ? link.toInterface : link.fromInterface,
    conn.interfaceB
  );
}

function innerHopMatches(
  link: TopologyLink,
  localHostId: string,
  remoteBoxIds: Set<string>,
  remoteHost: TopologyLinkPeerHost | undefined,
  localInterface: TopologyInterfaceReference | undefined,
  remoteInterface: TopologyInterfaceReference | undefined
): boolean {
  const other = otherEndpoint(link, localHostId);
  if (!other || !remoteBoxIds.has(other)) {
    return false;
  }
  const localIsFrom = link.from === localHostId;
  return hopFieldsMatch(
    undefined,
    undefined,
    localIsFrom ? link.fromInterface : link.toInterface,
    localInterface,
    localIsFrom ? link.toPeerHost : link.fromPeerHost,
    remoteHost,
    localIsFrom ? link.toInterface : link.fromInterface,
    remoteInterface
  );
}

function removeMatchingLinks(map: TopologyMap, matches: (link: TopologyLink) => boolean): TopologyMap {
  let next = map;
  for (const link of map.links) {
    if (matches(link)) {
      next = removeLinkByEndpoints(next, link.from, link.to);
    }
  }
  return next;
}

function removeOverviewHops(
  options: TopologyPanelOptions,
  conn: InterSubmapConnection,
  skipMapId: string
): TopologyPanelOptions {
  let next = options;
  for (const entry of listPanelMaps(options)) {
    if (entry.mapId === skipMapId) {
      continue;
    }
    const idsA = boxIdsOf(entry.map, conn.mapIdA);
    const idsB = boxIdsOf(entry.map, conn.mapIdB);
    if (!idsA.size || !idsB.size) {
      continue;
    }
    const trimmed = removeMatchingLinks(entry.map, (link) => overviewHopMatches(link, idsA, idsB, conn));
    if (trimmed !== entry.map) {
      next = writeMap(next, entry.mapId, trimmed);
    }
  }
  return next;
}

function removeInnerHop(
  options: TopologyPanelOptions,
  localMapId: string,
  remoteMapId: string,
  localHost: TopologyLinkPeerHost | undefined,
  remoteHost: TopologyLinkPeerHost | undefined,
  localInterface: TopologyInterfaceReference | undefined,
  remoteInterface: TopologyInterfaceReference | undefined,
  skipMapId: string
): TopologyPanelOptions {
  if (localMapId === skipMapId) {
    return options;
  }
  const map = resolveTopologyMapById(options, localMapId);
  if (!map) {
    return options;
  }
  const remoteBoxIds = boxIdsOf(map, remoteMapId);
  if (!remoteBoxIds.size) {
    return options;
  }
  const host = findLocalHost(map, localHost);
  if (!host) {
    return options;
  }
  const trimmed = removeMatchingLinks(map, (link) =>
    innerHopMatches(link, host.id, remoteBoxIds, remoteHost, localInterface, remoteInterface)
  );
  if (trimmed === map) {
    return options;
  }
  return writeMap(options, localMapId, trimmed);
}

/**
 * Remove os cabos espelhados da conexão entre dois submapas (raiz e hops internos).
 * O mapa em que o usuário acabou de excluir o cabo não é reescrito.
 * Sem o hop correspondente, a interface deixa de estar vinculada — fica disponível de novo.
 */
export function removeInterSubmapCounterpartLinks(
  options: TopologyPanelOptions,
  currentMapId: string,
  link: TopologyLink,
  sourceMap?: TopologyMap
): TopologyPanelOptions {
  const currentMap = sourceMap ?? resolveTopologyMapById(options, currentMapId);
  if (!currentMap) {
    return options;
  }
  const conn = describeInterSubmapConnection(currentMapId, currentMap, link);
  if (!conn) {
    return options;
  }

  let next = removeOverviewHops(options, conn, currentMapId);
  next = removeInnerHop(
    next,
    conn.mapIdA,
    conn.mapIdB,
    conn.hostA,
    conn.hostB,
    conn.interfaceA,
    conn.interfaceB,
    currentMapId
  );
  return removeInnerHop(
    next,
    conn.mapIdB,
    conn.mapIdA,
    conn.hostB,
    conn.hostA,
    conn.interfaceB,
    conn.interfaceA,
    currentMapId
  );
}

/**
 * Exclusão em cascata: cada cabo que saiu do mapa ativo leva embora o espelho nos outros mapas.
 */
export function removeMissingInterSubmapCounterparts(
  options: TopologyPanelOptions,
  currentMapId: string,
  previousMap: TopologyMap,
  currentMap: TopologyMap
): TopologyPanelOptions {
  let next = options;
  for (const link of previousMap.links) {
    if (currentMap.links.some((item) => linksMatchEndpoints(item, link))) {
      continue;
    }
    next = removeInterSubmapCounterpartLinks(next, currentMapId, link, previousMap);
  }
  return next;
}
