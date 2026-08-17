import { HostMetadata, HostMetadataMap, TopologyMap } from '../types';
import { QuerySource } from '../services/queryIndex';
import { resolveHostIp } from './hostLookup';
import { isIpv4 } from './ipv4';
import { extractHostMetadataFromData, extractQueryHosts } from './queryHosts';
import { isHostNode } from './topologyNodes';

/** Lista de hosts da Query oferecida nos pickers (adicionar host, vincular nó, bulk edit). */

export interface QueryHostOption {
  visibleName: string;
  technicalName: string;
  ip?: string;
}

export interface QueryHostNodeRef {
  zabbixHost?: string;
  subtitle?: string;
  label?: string;
}

function queryHostIpCandidates(node: QueryHostNodeRef): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed || !isIpv4(trimmed) || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  };
  add(node.subtitle);
  add(node.zabbixHost);
  return out;
}

function hostMetadataNamesMatch(a?: string, b?: string): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}

function ipv4OrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && isIpv4(trimmed) ? trimmed : undefined;
}

/** IP de um host da Query (labels, chave IPv4 ou índice por nome no metadata). */
function resolveQueryHostOptionIp(
  hostKey: string,
  meta: HostMetadata | undefined,
  metadata: HostMetadataMap
): string | undefined {
  const fromMeta = ipv4OrUndefined(meta?.ip);
  if (fromMeta) {
    return fromMeta;
  }
  if (isIpv4(hostKey)) {
    return hostKey;
  }

  const direct = ipv4OrUndefined(metadata[hostKey]?.ip);
  if (direct) {
    return direct;
  }

  const hostKeyLower = hostKey.trim().toLowerCase();
  for (const [key, entry] of Object.entries(metadata)) {
    const entryIp = ipv4OrUndefined(entry.ip);
    if (entryIp && key.toLowerCase() === hostKeyLower) {
      return entryIp;
    }
    if (entryIp && hostMetadataNamesMatch(entry.name, hostKey)) {
      return entryIp;
    }
    if (!isIpv4(key)) {
      continue;
    }
    const entryName = entry.name?.trim();
    if (hostMetadataNamesMatch(entryName, hostKey) || hostMetadataNamesMatch(entryName, meta?.name)) {
      return key;
    }
  }
  return undefined;
}

function formatQueryHostOptionLabel(host: QueryHostOption): string {
  if (host.ip && isIpv4(host.ip)) {
    return `${host.visibleName} (${host.ip})`;
  }
  return host.visibleName;
}

/** Nó do mapa cujo IP serve para completar uma opção da Query sem IP. */
function nodeIpForOption(map: TopologyMap, opt: QueryHostOption): string | undefined {
  for (const node of map.nodes) {
    if (!isHostNode(node)) {
      continue;
    }
    const nodeIp = resolveHostIp(node);
    if (!nodeIp) {
      continue;
    }
    const linked = node.zabbixHost?.trim();
    const label = node.label?.trim();
    const nameMatch =
      linked === opt.visibleName ||
      linked === opt.technicalName ||
      label === opt.visibleName ||
      label === opt.technicalName;
    const ipKeyMatch = linked === nodeIp && (opt.visibleName === label || isIpv4(opt.technicalName));
    if (nameMatch || ipKeyMatch) {
      return nodeIp;
    }
  }
  return undefined;
}

/** Preenche IP ausente na Query com subtitle/zabbixHost dos nós já salvos no mapa. */
export function enrichQueryHostOptionsFromMap(
  options: QueryHostOption[],
  map: TopologyMap
): QueryHostOption[] {
  if (!options.length) {
    return options;
  }

  return options.map((opt) => {
    if (opt.ip && isIpv4(opt.ip)) {
      return opt;
    }
    const nodeIp = nodeIpForOption(map, opt);
    return nodeIp ? { ...opt, ip: nodeIp } : opt;
  });
}

/** Hosts visíveis + IP a partir das séries da Query do painel. */
export function extractQueryHostOptions(
  data: QuerySource,
  metadataOverride?: HostMetadataMap
): QueryHostOption[] {
  const metadata = metadataOverride ?? extractHostMetadataFromData(data);
  const hostKeys = extractQueryHosts(data);
  const options: QueryHostOption[] = [];
  const seen = new Set<string>();

  for (const hostKey of hostKeys) {
    const meta = metadata[hostKey];
    const visibleName = meta?.name?.trim() || hostKey;
    const ip = resolveQueryHostOptionIp(hostKey, meta, metadata);
    const technicalName = isIpv4(hostKey) ? visibleName : hostKey;
    const dedupeKey = (ip && isIpv4(ip) ? ip : visibleName).toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    options.push({
      visibleName,
      technicalName,
      ip,
    });
  }

  return options.sort((a, b) => a.visibleName.localeCompare(b.visibleName));
}

/** Encontra o host da Query que corresponde ao nó do mapa (IP, depois nome). */
export function resolveQueryHostOptionForNode(
  list: QueryHostOption[],
  node: QueryHostNodeRef
): QueryHostOption | undefined {
  for (const ip of queryHostIpCandidates(node)) {
    const byIp = list.find((host) => host.ip === ip);
    if (byIp) {
      return byIp;
    }
  }

  const name = node.zabbixHost?.trim();
  const label = node.label?.trim();
  for (const candidate of [name, label]) {
    if (!candidate || isIpv4(candidate)) {
      continue;
    }
    const lower = candidate.toLowerCase();
    const byName = list.find(
      (host) =>
        host.visibleName.toLowerCase() === lower || host.technicalName.toLowerCase() === lower
    );
    if (byName) {
      return byName;
    }
  }

  return undefined;
}

/** IPs/nomes já usados por hosts do mapa (para excluir da lista de hosts disponíveis). */
export function hostsAlreadyOnMap(
  map: TopologyMap,
  exceptIp?: string,
  exceptName?: string
): { ips: Set<string>; names: Set<string> } {
  const ips = new Set<string>();
  const names = new Set<string>();
  const skipIp = exceptIp?.trim();
  const skipName = exceptName?.trim();
  for (const entry of map.nodes) {
    if (!isHostNode(entry)) {
      continue;
    }
    const ip = resolveHostIp(entry);
    if (ip && ip !== skipIp) {
      ips.add(ip);
    }
    const z = entry.zabbixHost?.trim();
    if (z && !isIpv4(z) && z !== skipName) {
      names.add(z);
    }
    const label = entry.label?.trim();
    if (label && label !== skipName && label !== z) {
      names.add(label);
    }
  }
  return { ips, names };
}

export function queryHostPickerOptions(
  list: QueryHostOption[],
  onMap: { ips: Set<string>; names: Set<string> },
  boundHost?: QueryHostOption
): Array<{ label: string; value: string }> {
  return list
    .filter((host) => {
      if (boundHost?.ip && host.ip === boundHost.ip) {
        return true;
      }
      if (host.ip && onMap.ips.has(host.ip)) {
        return false;
      }
      return !onMap.names.has(host.visibleName);
    })
    .map((host) => ({
      label: formatQueryHostOptionLabel(host),
      value: host.ip ?? host.visibleName,
    }));
}

/** Restringe o picker de hosts às queries marcadas para exibição no mapa. */
export function filterQueryHostOptionsByDisplayHosts(
  options: QueryHostOption[],
  displayHosts: string[],
  metadata: HostMetadataMap = {}
): QueryHostOption[] {
  if (!displayHosts.length) {
    return options;
  }

  const displayKeys = new Set<string>();
  for (const key of displayHosts) {
    const trimmed = key.trim();
    if (!trimmed) {
      continue;
    }
    displayKeys.add(trimmed.toLowerCase());
    const meta = metadata[trimmed];
    const name = meta?.name?.trim();
    const ip = meta?.ip?.trim();
    if (name) {
      displayKeys.add(name.toLowerCase());
    }
    if (ip) {
      displayKeys.add(ip.toLowerCase());
    }
  }

  return options.filter((opt) => {
    const keys = [opt.visibleName, opt.technicalName, opt.ip]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    return keys.some((key) => displayKeys.has(key));
  });
}
