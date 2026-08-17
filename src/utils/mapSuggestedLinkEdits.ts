/** Sugestões de links descobertos (LLDP/CDP) — revisão manual obrigatória. */
import { TopologyMap, TopologySuggestedLink } from '../types';
import { addLinkWithInterfaces } from './mapLinkEdits';

export function mergeSuggestedLinks(
  map: TopologyMap,
  incoming: TopologySuggestedLink[]
): TopologyMap {
  const prev = map.suggestedLinks ?? [];
  const ignored = new Map(prev.filter((s) => s.state === 'ignored').map((s) => [s.id, s]));
  const merged = new Map<string, TopologySuggestedLink>();

  for (const item of incoming) {
    if (ignored.has(item.id)) {
      merged.set(item.id, ignored.get(item.id) as TopologySuggestedLink);
      continue;
    }
    merged.set(item.id, item);
  }
  for (const [id, item] of ignored) {
    if (!merged.has(id)) {
      merged.set(id, item);
    }
  }

  const suggestedLinks = [...merged.values()].filter((s) => s.state === 'suggested' || s.state === 'ignored');
  if (!suggestedLinks.length) {
    const { suggestedLinks: _removed, ...rest } = map;
    return rest as TopologyMap;
  }
  return { ...map, suggestedLinks };
}

export function ignoreSuggestedLink(map: TopologyMap, id: string): TopologyMap {
  const list = map.suggestedLinks ?? [];
  if (!list.some((s) => s.id === id)) {
    return map;
  }
  return {
    ...map,
    suggestedLinks: list.map((s) => (s.id === id ? { ...s, state: 'ignored' as const } : s)),
  };
}

export function removeSuggestedLink(map: TopologyMap, id: string): TopologyMap {
  const list = (map.suggestedLinks ?? []).filter((s) => s.id !== id);
  if (!list.length) {
    const { suggestedLinks: _removed, ...rest } = map;
    return rest as TopologyMap;
  }
  return { ...map, suggestedLinks: list };
}

export function confirmSuggestedLink(map: TopologyMap, id: string): TopologyMap {
  const sugg = map.suggestedLinks?.find((s) => s.id === id);
  if (!sugg || sugg.state === 'ignored') {
    return map;
  }

  let next = addLinkWithInterfaces(map, sugg.fromNodeId, sugg.toNodeId, {
    fromInterface: sugg.fromInterface,
    toInterface: sugg.toInterface,
    discovery: { source: sugg.source, state: 'confirmed', confirmed: true },
  });

  next = {
    ...next,
    links: next.links.map((link) => {
      if (link.from !== sugg.fromNodeId || link.to !== sugg.toNodeId) {
        return link;
      }
      return {
        ...link,
        discovery: { source: sugg.source, state: 'confirmed', confirmed: true },
      };
    }),
  };

  return removeSuggestedLink(next, id);
}

export function confirmAllSuggestedLinks(map: TopologyMap): TopologyMap {
  let next = map;
  for (const sugg of map.suggestedLinks ?? []) {
    if (sugg.state === 'suggested') {
      next = confirmSuggestedLink(next, sugg.id);
    }
  }
  return next;
}
