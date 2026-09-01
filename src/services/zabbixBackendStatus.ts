import { PLUGIN_RESOURCES } from './pluginBackend';
import { grafanaFetch } from './grafanaFetch';
import type { HostProblemsMap } from '../utils/noc/types';
import type { TopologyStatusValueMapping } from '../types';
import type { ZabbixDirectHost, ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
import type {
  BackendLayoutLink,
  BackendLayoutNode,
  ZabbixBackendPollLayout,
} from '../utils/zabbixBackendLayout';

export type { BackendLayoutLink, BackendLayoutNode, ZabbixBackendPollLayout };

export interface BackendRegionStatRow {
  nodeId: string;
  up: number;
  down: number;
  degraded: number;
  unknown: number;
  total: number;
  rxBps?: number;
  txBps?: number;
  loadFailed?: boolean;
  loadPending?: boolean;
}

export interface BackendHostStatusRow {
  hostId: string;
  host: string;
  name: string;
  ip?: string;
  groups: string[];
  status?: string;
  lastvalue?: string;
  lastclock?: string;
  itemId?: string;
}

export interface ZabbixBackendStatusRequest {
  datasourceUid: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  trafficItemIds: string[];
  trafficKeys: string[];
  statusValueMappings: TopologyStatusValueMapping[];
  nodes: BackendLayoutNode[];
  links: BackendLayoutLink[];
  childHostKeys?: Record<string, string[]>;
  submapHosts?: Record<string, string[]>;
  submapHostsFailed?: string[];
}

export interface ZabbixBackendStatusResponse {
  savedAt: number;
  hosts: BackendHostStatusRow[];
  regionStats: BackendRegionStatRow[];
  problems: HostProblemsMap;
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  error?: string;
}

export function hostsFromBackendRows(rows: BackendHostStatusRow[]): ZabbixDirectHost[] {
  return rows.map((row) => ({
    hostid: row.hostId,
    host: row.host,
    name: row.name,
    ip: row.ip,
    groups: row.groups ?? [],
  }));
}

export function statusItemsFromBackendRows(
  rows: BackendHostStatusRow[],
  statusItemKey: string
): ZabbixInterfaceItem[] {
  const items: ZabbixInterfaceItem[] = [];
  for (const row of rows) {
    const itemid = row.itemId?.trim();
    if (!itemid) {
      continue;
    }
    items.push({
      itemid,
      key_: statusItemKey,
      hostid: row.hostId,
      lastvalue: row.lastvalue,
      lastclock: row.lastclock,
    });
  }
  return items;
}

export function httpStatusFromError(err: unknown): number | undefined {
  return (err as { status?: number; statusCode?: number } | undefined)?.status
    ?? (err as { statusCode?: number } | undefined)?.statusCode;
}

export function compactSubmapHostsForBackend(
  input?: Record<string, string[] | null | undefined>
): { submapHosts: Record<string, string[]>; submapHostsFailed: string[] } {
  const submapHosts: Record<string, string[]> = {};
  const submapHostsFailed: string[] = [];
  if (!input) {
    return { submapHosts, submapHostsFailed };
  }
  for (const [id, value] of Object.entries(input)) {
    if (value === null) {
      submapHostsFailed.push(id);
      continue;
    }
    if (Array.isArray(value)) {
      submapHosts[id] = value;
    }
  }
  return { submapHosts, submapHostsFailed };
}

export function buildZabbixBackendStatusRequest(
  body: Omit<ZabbixBackendStatusRequest, 'nodes' | 'links' | 'childHostKeys' | 'submapHosts' | 'submapHostsFailed'> & {
    layout?: ZabbixBackendPollLayout;
  }
): ZabbixBackendStatusRequest {
  const layout = body.layout;
  const compact = compactSubmapHostsForBackend(layout?.submapHosts);
  return {
    datasourceUid: body.datasourceUid,
    groupNames: body.groupNames,
    statusItemKey: body.statusItemKey,
    refreshSec: body.refreshSec,
    trafficItemIds: body.trafficItemIds,
    trafficKeys: body.trafficKeys,
    statusValueMappings: body.statusValueMappings,
    nodes: layout?.nodes ?? [],
    links: layout?.links ?? [],
    childHostKeys: layout?.childHostKeys,
    submapHosts: compact.submapHosts,
    submapHostsFailed: layout?.submapHostsFailed?.length ? layout.submapHostsFailed : compact.submapHostsFailed,
  };
}

export async function fetchZabbixBackendStatus(
  body: ZabbixBackendStatusRequest,
  abortSignal?: AbortSignal
): Promise<ZabbixBackendStatusResponse> {
  return grafanaFetch<ZabbixBackendStatusResponse>({
    url: `${PLUGIN_RESOURCES}/zabbix-status`,
    method: 'POST',
    data: body,
    abortSignal,
    requestId: `luminous-topology:zabbix-status:${body.datasourceUid}`,
  });
}
