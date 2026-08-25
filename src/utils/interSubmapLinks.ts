import { TopologyInterfaceReference, TopologyLink, TopologyLinkPeerHost, TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { activeChildMaps } from './childMapEdits';
import { removeLinkByEndpoints, upsertLinkWithInterfaces } from './mapLinkEdits';
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

function findOverviewWithBothBoxes(
  options: TopologyPanelOptions,
  mapIdA: string,
  mapIdB: string
): { mapId: string; map: TopologyMap; boxA: TopologyNode; boxB: TopologyNode } | undefined {
  const entries: Array<{ mapId: string; map: TopologyMap }> = [
    { mapId: ROOT_MAP_ID, map: options.map },
    ...Object.entries(activeChildMaps(options.childMaps)).map(([mapId, map]) => ({ mapId, map })),
  ];
  for (const entry of entries) {
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
