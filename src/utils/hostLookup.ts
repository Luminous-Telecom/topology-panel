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

interface HostMetadataLookupIndex {
  byLowerKey: Map<string, HostMetadata>;
  byIp: Map<string, HostMetadata>;
  byNameLower: Map<string, HostMetadata>;
  namesByIp: Map<string, string[]>;
  ipByNameExact: Map<string, string>;
}

const metadataLookupIndexCache = new WeakMap<HostMetadataMap, HostMetadataLookupIndex>();

function ipv4Of(value?: string): string | undefined {
  const ip = value?.trim();
  return ip && isIpv4(ip) ? ip : undefined;
}

function indexMetadataKey(index: HostMetadataLookupIndex, key: string, entry: HostMetadata): void {
  const keyTrim = key.trim();
  if (keyTrim) {
    const lower = keyTrim.toLowerCase();
    if (!index.byLowerKey.has(lower)) {
      index.byLowerKey.set(lower, entry);
    }
  }
  const ip = ipv4Of(entry.ip);
  const name = entry.name?.trim();
  if (ip) {
    if (!index.byIp.has(ip)) {
      index.byIp.set(ip, entry);
    }
    if (name) {
      const names = index.namesByIp.get(ip) ?? [];
      if (!names.includes(name)) {
        names.push(name);
        index.namesByIp.set(ip, names);
      }
      if (!index.ipByNameExact.has(name)) {
        index.ipByNameExact.set(name, ip);
      }
    }
  }
  if (name) {
    const nameLower = name.toLowerCase();
    if (!index.byNameLower.has(nameLower)) {
      index.byNameLower.set(nameLower, entry);
    }
  }
}

function buildMetadataLookupIndex(metadata: HostMetadataMap): HostMetadataLookupIndex {
  const index: HostMetadataLookupIndex = {
    byLowerKey: new Map(),
    byIp: new Map(),
    byNameLower: new Map(),
    namesByIp: new Map(),
    ipByNameExact: new Map(),
  };
  for (const [key, entry] of Object.entries(metadata)) {
    indexMetadataKey(index, key, entry);
  }
  return index;
}

/** Índice O(1) por IP/nome — o mesmo objeto de metadata reusa o cache (WeakMap). */
function metadataLookupIndex(metadata: HostMetadataMap): HostMetadataLookupIndex {
  const cached = metadataLookupIndexCache.get(metadata);
  if (cached) {
    return cached;
  }
  const built = buildMetadataLookupIndex(metadata);
  metadataLookupIndexCache.set(metadata, built);
  return built;
}

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
  if (hostKey && metadata) {
    const index = metadataLookupIndex(metadata);
    const exactIp = index.ipByNameExact.get(hostKey);
    if (exactIp) {
      return exactIp;
    }
    const entry =
      index.byNameLower.get(hostKey.toLowerCase()) ?? index.byLowerKey.get(hostKey.toLowerCase());
    const fromIndex = ipv4Of(entry?.ip);
    if (fromIndex) {
      return fromIndex;
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

function nameKeysOf(ref: HostLookupRef): string[] {
  return [ref.zabbixHost, ref.label]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && !isIpv4(value)));
}

function lookupIndexedMetadata(
  metadata: HostMetadataMap,
  index: HostMetadataLookupIndex,
  ip: string | undefined,
  nameKeys: string[]
): HostMetadata | undefined {
  if (ip) {
    const byIp = metadata[ip];
    if (byIp) {
      return byIp;
    }
    const trimmed = ip.trim();
    const indexed = index.byIp.get(trimmed) ?? index.byLowerKey.get(trimmed.toLowerCase());
    if (indexed) {
      return indexed;
    }
  }
  for (const key of nameKeys) {
    const byName = metadata[key];
    if (byName) {
      return byName;
    }
  }
  for (const key of nameKeys) {
    const lower = key.trim().toLowerCase();
    if (!lower) {
      continue;
    }
    const indexed = index.byLowerKey.get(lower) ?? index.byNameLower.get(lower);
    if (indexed) {
      return indexed;
    }
  }
  return undefined;
}

/** Entrada de metadata por IP, por chave de nome, ou por `name` de qualquer entrada. */
export function findHostMetadata(
  metadata: HostMetadataMap,
  ip: string | undefined,
  nameKeys: string[]
): HostMetadata | undefined {
  return lookupIndexedMetadata(metadata, metadataLookupIndex(metadata), ip, nameKeys);
}

/** `hostid` gravado no índice para uma chave de lookup (IP, label ou nome técnico). */
export function hostidFromLookupKey(key: string, metadata?: HostMetadataMap): string | undefined {
  const trimmed = key.trim();
  if (!trimmed || !metadata) {
    return undefined;
  }
  const direct = metadata[trimmed]?.hostid?.trim();
  if (direct) {
    return direct;
  }
  const ip = isIpv4(trimmed) ? trimmed : undefined;
  return findHostMetadata(metadata, ip, ip ? [] : [trimmed])?.hostid?.trim();
}

function numericHostId(value?: string): string | undefined {
  const id = value?.trim();
  return id && /^\d+$/.test(id) ? id : undefined;
}

/** `hostid` Zabbix do nó — IP/nome da metadata vencem `zabbixHostId` legado no JSON. */
export function resolveHostZabbixId(
  ref: HostLookupRef,
  metadata?: HostMetadataMap
): string | undefined {
  if (metadata) {
    for (const key of collectHostLookupCandidates(ref, metadata)) {
      const id = hostidFromLookupKey(key, metadata);
      if (id) {
        return id;
      }
    }
    const fromMeta = findHostMetadata(
      metadata,
      resolveHostIp(ref, metadata),
      nameKeysOf(ref)
    )?.hostid?.trim();
    if (fromMeta) {
      return fromMeta;
    }
  }
  return numericHostId(ref.zabbixHostId);
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

/** Metadata só dos hosts desenhados nos mapas (raiz + filhos) — busca de problemas Zabbix. */
export function collectHostMetadataForMaps(
  maps: readonly TopologyMap[],
  hostMetadata: HostMetadataMap
): HostMetadataMap {
  const subset: HostMetadataMap = {};
  for (const map of maps) {
    for (const node of map.nodes ?? []) {
      if (!isHostNode(node)) {
        continue;
      }
      const key = resolveHostLookupKey(node, hostMetadata);
      if (key && hostMetadata[key]) {
        subset[key] = hostMetadata[key];
      }
    }
  }
  return subset;
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
  const index = metadata ? metadataLookupIndex(metadata) : undefined;
  // IP primeiro — status/hover/sync preferem interface estável ao rename.
  // (resolveHostIp já cobre subtitle/zabbixHost como IP; se vier vazio, nenhum dos dois é IP.)
  if (resolvedIp) {
    add(resolvedIp);
    const metaByIp = metadata?.[resolvedIp];
    if (metaByIp?.name) {
      add(metaByIp.name);
    }
    if (index) {
      for (const name of index.namesByIp.get(resolvedIp) ?? []) {
        add(name);
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
    add(hostId);
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

  if (zabbixHost && !isIpv4(zabbixHost) && index) {
    const ip = index.ipByNameExact.get(zabbixHost);
    if (ip) {
      add(ip);
    }
  }

  if (metadata && index) {
    const entry = lookupIndexedMetadata(metadata, index, resolvedIp, nameKeysOf(ref));
    if (entry) {
      if (entry.ip && isIpv4(entry.ip)) {
        add(entry.ip);
      }
      if (entry.name) {
        add(entry.name);
      }
      if (entry.hostid) {
        add(entry.hostid);
      }
    }
  }

  return out;
}

/** Propaga IP/label/`zabbixHost` do mapa para o metadata da Query. */
export function enrichHostMetadataFromMap(meta: HostMetadataMap, map: TopologyMap): HostMetadataMap {
  if (!Object.keys(meta).length || !map.nodes.length) {
    return meta;
  }

  const result: HostMetadataMap = { ...meta };
  const index = buildMetadataLookupIndex(result);
  metadataLookupIndexCache.set(result, index);

  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const ip = resolveHostIp(node, result);
    const nameKeys = [node.label?.trim(), node.zabbixHost?.trim()].filter(
      (value): value is string => Boolean(value && !isIpv4(value))
    );
    if (!ip && nameKeys.length === 0) {
      continue;
    }

    const entry = lookupIndexedMetadata(result, index, ip, nameKeys);
    if (!entry) {
      continue;
    }

    const next: HostMetadata = {
      ...entry,
      ip: entry.ip && isIpv4(entry.ip) ? entry.ip : ip,
    };
    if (ip) {
      result[ip] = next;
      indexMetadataKey(index, ip, next);
    }
    if (next.name?.trim()) {
      result[next.name.trim()] = next;
      indexMetadataKey(index, next.name.trim(), next);
    }
    for (const key of nameKeys) {
      result[key] = next;
      indexMetadataKey(index, key, next);
    }
  }

  return result;
}

/** Mesma propagação em raiz + mapas filhos — a lista de alertas não depende do mapa aberto. */
export function enrichHostMetadataFromMaps(
  meta: HostMetadataMap,
  maps: readonly TopologyMap[]
): HostMetadataMap {
  let result = meta;
  for (const map of maps) {
    result = enrichHostMetadataFromMap(result, map);
  }
  return result;
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
  if (incoming.value === 0) {
    return incoming;
  }
  if (current.value === 0) {
    return current;
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

  let result: HostDisplayMap | undefined;

  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const ip = resolveHostIp(node, metadata);
    if (!ip) {
      continue;
    }

    const ref = {
      zabbixHost: node.zabbixHost,
      subtitle: node.subtitle,
      label: node.label,
      zabbixHostId: node.zabbixHostId,
    };
    const source = result ?? display;
    let alias: HostDisplayInfo | undefined;
    for (const key of collectHostLookupCandidates(ref, metadata)) {
      if (key === ip) {
        continue;
      }
      const info = source[key];
      if (info) {
        alias = alias ? preferHostDisplayInfo(alias, info) : info;
      }
    }
    if (!alias) {
      continue;
    }
    if (!result) {
      result = { ...display };
    }
    result[ip] = result[ip] ? preferHostDisplayInfo(result[ip], alias) : alias;
  }

  return result ?? display;
}

/** Indexa status da Query pelos IPs de todos os mapas (raiz + filhos). */
export function enrichHostDisplayFromMaps(
  display: HostDisplayMap,
  maps: readonly TopologyMap[],
  metadata?: HostMetadataMap
): HostDisplayMap {
  let result = display;
  for (const map of maps) {
    result = enrichHostDisplayFromMap(result, map, metadata);
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
