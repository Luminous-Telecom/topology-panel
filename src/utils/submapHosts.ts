import { TopologyMap } from '../types';
import { isHostNode, isIpv4 } from '../utils';

/** Nós type=host visíveis do mapa (fora da lista hiddenHosts), com nome/IP já trim(). */
function visibleHostRefs(map: TopologyMap): Array<{ name?: string; ip?: string }> {
  const hidden = new Set((map.hiddenHosts ?? []).map((h) => h.trim()).filter(Boolean));
  const refs: Array<{ name?: string; ip?: string }> = [];

  for (const node of map.nodes ?? []) {
    if (!isHostNode(node)) {
      continue;
    }
    const name = node.zabbixHost?.trim();
    const subtitle = node.subtitle?.trim();
    const ip = subtitle && isIpv4(subtitle) ? subtitle : name && isIpv4(name) ? name : undefined;
    const hiddenKey = ip ?? name;
    if (hiddenKey && hidden.has(hiddenKey)) {
      continue;
    }
    if (name && hidden.has(name)) {
      continue;
    }
    refs.push({ name, ip });
  }

  return refs;
}

/** Hosts type=host do mapa — prefer IP, senão nome (não hostid). */
export function extractTopologyHostNames(map: TopologyMap): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  for (const { name, ip } of visibleHostRefs(map)) {
    const key = ip ?? name;
    if (!key) {
      continue;
    }
    const dedupe = key.toLowerCase();
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);
    hosts.push(key);
  }

  return hosts;
}

/** Refs visíveis (nome/IP) dos hosts type=host do mapa. */
export function extractTopologyHostRefs(map: TopologyMap): Array<{ name?: string; ip?: string }> {
  return visibleHostRefs(map);
}
