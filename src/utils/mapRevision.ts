import { TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { sameStructure } from './structuralIdentity';

/**
 * True quando alguma peça estrutural do mapa trocou de identidade.
 *
 * Arraste cria um `nodes` novo com o mesmo comprimento — isso basta para pular `JSON.stringify`
 * do mapa inteiro. Dois mapas vazios com arrays diferentes ainda passam pelo JSON (teste de no-op).
 */
export function mapRevisionChanged(prev: TopologyMap, next: TopologyMap): boolean {
  if (
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.locked !== next.locked ||
    prev.networksLocked !== next.networksLocked ||
    prev.hiddenHosts !== next.hiddenHosts ||
    prev.hostIcons !== next.hostIcons ||
    prev.schemaVersion !== next.schemaVersion
  ) {
    return true;
  }
  if (prev.links !== next.links && (prev.links.length > 0 || next.links.length > 0)) {
    return true;
  }
  if (prev.nodes === next.nodes) {
    return false;
  }
  return prev.nodes.length > 0 || next.nodes.length > 0;
}

/** True quando cada nó tem o mesmo id e a mesma caixa (x/y/largura/altura) nos dois mapas. */
export function sameNodeGeometry(left: TopologyMap, right: TopologyMap): boolean {
  if (left.nodes.length !== right.nodes.length) {
    return false;
  }
  const byId = new Map(right.nodes.map((node) => [node.id, node]));
  for (const node of left.nodes) {
    const other = byId.get(node.id);
    if (!other) {
      return false;
    }
    if (other.x !== node.x || other.y !== node.y || other.width !== node.width || other.height !== node.height) {
      return false;
    }
  }
  return true;
}

/** True quando trava e dimensões do canvas são iguais — o eco do Grafana não pode apagar a trava local. */
export function sameMapDocumentFlags(left: TopologyMap, right: TopologyMap): boolean {
  return (
    left.locked === right.locked &&
    left.networksLocked === right.networksLocked &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameNodeIdentity(left: TopologyNode, right: TopologyNode): boolean {
  return (
    left.type === right.type &&
    left.label === right.label &&
    left.subtitle === right.subtitle &&
    left.icon === right.icon &&
    left.zabbixHost === right.zabbixHost
  );
}

/**
 * True quando os dois arrays têm os mesmos nós (por id) e só x/y/largura/altura diferem.
 * Arraste e resize não exigem rematch com a Query nem recálculo de stats de região.
 */
export function nodesOnlyMoved(prev: TopologyNode[], next: TopologyNode[]): boolean {
  if (prev === next) {
    return true;
  }
  if (prev.length !== next.length) {
    return false;
  }
  const prevById = new Map(prev.map((node) => [node.id, node]));
  if (prevById.size !== next.length) {
    return false;
  }
  for (const node of next) {
    const other = prevById.get(node.id);
    if (!other || !sameNodeIdentity(other, node)) {
      return false;
    }
  }
  return true;
}

/**
 * True quando o merge com a Query pode só copiar x/y (e trava/dimensão do canvas).
 * Links, hosts ocultos e ícones precisam ser a mesma identidade — trava e width/height podem diferir.
 */
export function isPositionOnlyMapChange(prev: TopologyMap, next: TopologyMap): boolean {
  if (
    prev.links !== next.links ||
    prev.hiddenHosts !== next.hiddenHosts ||
    prev.hostIcons !== next.hostIcons ||
    prev.schemaVersion !== next.schemaVersion
  ) {
    return false;
  }
  return nodesOnlyMoved(prev.nodes, next.nodes);
}

/**
 * Reusa o array anterior quando só caixas mudaram. Poll de status e enrich de display não
 * leem x/y — um clone do Grafana (links novos, mesma lista) não pode remontar o índice.
 */
export function reuseMapsIfOnlyMoved(previous: TopologyMap[] | undefined, next: TopologyMap[]): TopologyMap[] {
  if (!previous || previous.length !== next.length) {
    return next;
  }
  for (let i = 0; i < next.length; i += 1) {
    const prevMap = previous[i];
    const nextMap = next[i];
    if (prevMap === nextMap) {
      continue;
    }
    if (prevMap.links.length !== nextMap.links.length || !nodesOnlyMoved(prevMap.nodes, nextMap.nodes)) {
      return next;
    }
  }
  return previous;
}

/** Nós/links iguais (ou só caixas mexidas). Trava e dimensões podem diferir. */
function mapsContentMatches(prev: TopologyMap | undefined, next: TopologyMap | undefined): boolean {
  if (prev === next) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }
  if (prev.schemaVersion !== next.schemaVersion) {
    return false;
  }
  if (!nodesOnlyMoved(prev.nodes, next.nodes)) {
    return false;
  }
  return (
    sameStructure(prev.links, next.links) &&
    sameStructure(prev.hiddenHosts, next.hiddenHosts) &&
    sameStructure(prev.hostIcons, next.hostIcons)
  );
}

function mapsOnlyMovedForOptions(prev: TopologyMap | undefined, next: TopologyMap | undefined): boolean {
  if (prev === next) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }
  if (
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.locked !== next.locked ||
    prev.networksLocked !== next.networksLocked
  ) {
    return false;
  }
  return mapsContentMatches(prev, next);
}

function patchMapDocumentFlags(base: TopologyMap, from: TopologyMap): TopologyMap {
  if (
    base.locked === from.locked &&
    base.networksLocked === from.networksLocked &&
    base.width === from.width &&
    base.height === from.height
  ) {
    return base;
  }
  return {
    ...base,
    locked: from.locked,
    networksLocked: from.networksLocked,
    width: from.width,
    height: from.height,
  };
}

function childMapsOnlyMoved(
  prev: TopologyPanelOptions['childMaps'],
  next: TopologyPanelOptions['childMaps']
): boolean {
  if (prev === next) {
    return true;
  }
  const prevMaps = prev ?? {};
  const nextMaps = next ?? {};
  const prevIds = Object.keys(prevMaps);
  const nextIds = Object.keys(nextMaps);
  if (prevIds.length !== nextIds.length) {
    return false;
  }
  for (const id of nextIds) {
    if (!mapsOnlyMovedForOptions(prevMaps[id], nextMaps[id])) {
      return false;
    }
  }
  return true;
}

/**
 * Eco do Grafana após arraste ou trava: o JSON volta clonado e um `options` novo redesenhava cada host.
 * Quando só as caixas mudaram, devolve o objeto anterior — o canvas já pinta pelo `displayMap`.
 * Quando só trava/dimensão mudou, reusa os nós e aplica os flags novos.
 */
export function reuseResolvedOptionsIfOnlyMoved(
  previous: TopologyPanelOptions | undefined,
  next: TopologyPanelOptions
): TopologyPanelOptions {
  if (!previous || previous === next) {
    return previous ?? next;
  }
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  keys.delete('map');
  keys.delete('childMaps');
  for (const key of keys) {
    const field = key as keyof TopologyPanelOptions;
    if (!sameStructure(previous[field], next[field])) {
      return next;
    }
  }
  if (!childMapsOnlyMoved(previous.childMaps, next.childMaps)) {
    return next;
  }
  if (mapsOnlyMovedForOptions(previous.map, next.map)) {
    return previous;
  }
  if (!previous.map || !next.map || !mapsContentMatches(previous.map, next.map)) {
    return next;
  }
  const patchedMap = patchMapDocumentFlags(previous.map, next.map);
  if (patchedMap === previous.map) {
    return previous;
  }
  return { ...previous, map: patchedMap };
}
