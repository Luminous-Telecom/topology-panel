import { HostDisplayInfo, HostDisplayMap, HostMetadata, HostMetadataMap, TopologyMap, TopologyNode } from '../types';
import { hostIp as hostIpFromNode } from './hostTools';
import { isIpv4 } from './ipv4';
import { isHostNode } from './topologyNodes';

/**
 * Casamento entre host do mapa e host da Query.
 *
 * Regra única do projeto: **IP é a chave preferencial** (sobrevive a rename no Zabbix); nome só
 * entra quando não há IP, ou como alias adicional.
 */

/** IP do host (subtitle, zabbixHost ou metadata da Query). */
export function resolveHostIp(
  node: { zabbixHost?: string; subtitle?: string; zabbixHostId?: string },
  metadata?: HostMetadataMap
): string | undefined {
  const fromSubtitle = hostIpFromNode(node);
  if (fromSubtitle) {
    return fromSubtitle;
  }
  const hostKey = node.zabbixHost?.trim();
  if (hostKey && isIpv4(hostKey)) {
    return hostKey;
  }
  const hostId = node.zabbixHostId?.trim();
  const byId = hostId ? metadata?.[hostId] : undefined;
  if (byId?.ip && isIpv4(byId.ip)) {
    return byId.ip.trim();
  }
  const byName = hostKey ? metadata?.[hostKey] : undefined;
  if (byName?.ip && isIpv4(byName.ip)) {
    return byName.ip.trim();
  }
  if (hostKey) {
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.name?.trim() === hostKey && entry.ip && isIpv4(entry.ip)) {
        return entry.ip.trim();
      }
    }
  }
  return undefined;
}

/** Referência de host para casar Query com mapa (IP preferencial; nome só se não houver IP). */
export interface HostLookupRef {
  zabbixHost?: string;
  subtitle?: string;
  zabbixHostId?: string;
  label?: string;
}

/** Chave primária — IP quando existir; senão nome (zabbixHost / label). */
export function resolveHostLookupKey(
  node: HostLookupRef,
  metadata?: HostMetadataMap
): string | undefined {
  const ip = resolveHostIp(node, metadata);
  if (ip) {
    return ip;
  }
  const name = node.zabbixHost?.trim();
  if (name && !isIpv4(name)) {
    return name;
  }
  const label = node.label?.trim();
  if (label && !isIpv4(label)) {
    return label;
  }
  return name || label || undefined;
}

export function collectHostLookupCandidates(ref: HostLookupRef, metadata?: HostMetadataMap): string[] {
  const zabbixHost = ref.zabbixHost?.trim();
  const label = ref.label?.trim();
  const hostId = ref.zabbixHostId?.trim();
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  };

  const resolvedIp = resolveHostIp(ref, metadata);
  // IP primeiro — status/hover/sync preferem interface estável ao rename.
  // (resolveHostIp já cobre subtitle/zabbixHost como IP; se vier vazio, nenhum dos dois é IP.)
  if (resolvedIp) {
    add(resolvedIp);
    const metaByIp = metadata?.[resolvedIp];
    if (metaByIp?.name) {
      add(metaByIp.name);
    }
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.ip === resolvedIp && entry.name?.trim()) {
        add(entry.name);
      }
    }
  }

  // Nome só como fallback (ou alias depois do IP).
  if (zabbixHost && !isIpv4(zabbixHost)) {
    add(zabbixHost);
  }
  if (label && label !== zabbixHost && !isIpv4(label)) {
    add(label);
  }

  const metaByHost = zabbixHost ? metadata?.[zabbixHost] : undefined;
  if (metaByHost?.ip && isIpv4(metaByHost.ip)) {
    add(metaByHost.ip);
  }
  if (metaByHost?.name) {
    add(metaByHost.name);
  }

  if (label) {
    const metaByLabel = metadata?.[label];
    if (metaByLabel?.ip && isIpv4(metaByLabel.ip)) {
      add(metaByLabel.ip);
    }
    if (metaByLabel?.name) {
      add(metaByLabel.name);
    }
  }

  if (hostId) {
    const metaById = metadata?.[hostId];
    if (metaById) {
      if (metaById.ip && isIpv4(metaById.ip)) {
        add(metaById.ip);
      }
      if (metaById.name) {
        add(metaById.name);
      }
    }
  }

  if (zabbixHost && !isIpv4(zabbixHost)) {
    for (const entry of Object.values(metadata ?? {})) {
      if (entry.name?.trim() === zabbixHost && entry.ip && isIpv4(entry.ip)) {
        add(entry.ip);
      }
    }
  }

  return out;
}

/** Propaga IP do mapa para o metadata da Query (indexa por IP quando o nome ainda casa). */
export function enrichHostMetadataFromMap(meta: HostMetadataMap, map: TopologyMap): HostMetadataMap {
  if (!Object.keys(meta).length || !map.nodes.length) {
    return meta;
  }

  const result: HostMetadataMap = { ...meta };

  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const ip = resolveHostIp(node);
    if (!ip) {
      continue;
    }

    const nameKeys = [node.label?.trim(), node.zabbixHost?.trim()].filter(
      (value): value is string => Boolean(value && !isIpv4(value))
    );

    const entry = findMetadataEntry(result, ip, nameKeys);
    if (!entry) {
      continue;
    }

    const next: HostMetadata = {
      ...entry,
      ip: entry.ip && isIpv4(entry.ip) ? entry.ip : ip,
    };
    result[ip] = next;
    if (next.name?.trim()) {
      result[next.name.trim()] = next;
    }
    for (const key of nameKeys) {
      result[key] = next;
    }
  }

  return result;
}

/** Entrada de metadata por IP, por chave de nome, ou por `name` de qualquer entrada. */
function findMetadataEntry(
  metadata: HostMetadataMap,
  ip: string,
  nameKeys: string[]
): HostMetadata | undefined {
  const byIp = metadata[ip];
  if (byIp) {
    return byIp;
  }
  for (const key of nameKeys) {
    const byName = metadata[key];
    if (byName) {
      return byName;
    }
  }
  for (const value of Object.values(metadata)) {
    if (value.name && nameKeys.includes(value.name.trim())) {
      return value;
    }
  }
  return undefined;
}

/**
 * Mescla entradas do mesmo host (nome vs IP, buckets distintos).
 * Com `updatedAtSec`, vence o dado mais recente; sem timestamp, vence o incoming — assim recuperação
 * e queda refletem o último refresh, sem fixar online quando o Zabbix já voltou a 0.
 */
export function preferHostDisplayInfo(
  current: HostDisplayInfo,
  incoming: HostDisplayInfo
): HostDisplayInfo {
  const currentTs = current.updatedAtSec ?? 0;
  const incomingTs = incoming.updatedAtSec ?? 0;
  if (incomingTs !== currentTs) {
    return incomingTs > currentTs ? incoming : current;
  }
  if (incoming.value != null && current.value == null) {
    return incoming;
  }
  return incoming;
}

/** Indexa status da Query também pelo IP salvo no mapa (quando o nome ainda casa). */
export function enrichHostDisplayFromMap(
  display: HostDisplayMap,
  map: TopologyMap,
  metadata?: HostMetadataMap
): HostDisplayMap {
  if (!Object.keys(display).length || !map.nodes.length) {
    return display;
  }

  const result: HostDisplayMap = { ...display };

  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const ip = resolveHostIp(node, metadata);
    if (!ip) {
      continue;
    }

    const ref = { zabbixHost: node.zabbixHost, subtitle: node.subtitle, label: node.label };
    let alias: HostDisplayInfo | undefined;
    for (const key of collectHostLookupCandidates(ref, metadata)) {
      if (key === ip) {
        continue;
      }
      const info = result[key];
      if (info) {
        alias = alias ? preferHostDisplayInfo(alias, info) : info;
      }
    }
    if (!alias) {
      continue;
    }
    result[ip] = result[ip] ? preferHostDisplayInfo(result[ip], alias) : alias;
  }

  return result;
}

/** Chaves canônicas de host — IP quando existir no metadata, senão o próprio key. */
export function canonicalizeHostKeys(keys: string[], metadata?: HostMetadataMap): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    const key = raw.trim();
    if (!key) {
      continue;
    }
    const meta = metadata?.[key];
    const ip = meta?.ip?.trim() && isIpv4(meta.ip) ? meta.ip.trim() : isIpv4(key) ? key : undefined;
    const canonical = ip || key;
    const seenKey = canonical.toLowerCase();
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    out.push(canonical);
  }
  return out;
}

export function hostToNodeId(host: string): string {
  return host
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Chave de layout no mapa salvo — IP quando existir, senão zabbixHost. */
export function resolveHostLayoutKey(node: Pick<TopologyNode, 'zabbixHost' | 'subtitle'>): string | undefined {
  const ip = resolveHostIp(node);
  if (ip) {
    return ip;
  }
  return node.zabbixHost?.trim() || undefined;
}

/** Aliases do host para hiddenHosts (IP, nome visível, chave da Query). */
export function collectHostHiddenKeys(
  node?: Pick<TopologyNode, 'zabbixHost' | 'subtitle' | 'label'>,
  opts?: Pick<TopologyNode, 'zabbixHost' | 'subtitle' | 'label'>
): string[] {
  const keys = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) {
      keys.add(trimmed);
    }
  };
  add(node?.zabbixHost ?? opts?.zabbixHost);
  add(node?.subtitle ?? opts?.subtitle);
  add(node?.label ?? opts?.label);
  const ip = resolveHostIp({
    zabbixHost: node?.zabbixHost ?? opts?.zabbixHost,
    subtitle: node?.subtitle ?? opts?.subtitle,
  });
  if (ip) {
    keys.add(ip);
  }
  return [...keys];
}

/** Host da Query oculto pelo usuário (hiddenHosts pode ter IP ou nome). */
export function isQueryHostHidden(
  hostName: string,
  meta: HostMetadata | undefined,
  hidden: Set<string>
): boolean {
  const candidates = collectHostHiddenKeys({
    zabbixHost: hostName,
    label: meta?.name,
    subtitle: meta?.ip,
  });
  return candidates.some((key) => hidden.has(key));
}
