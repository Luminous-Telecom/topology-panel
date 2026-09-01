import { getBackendSrv } from '@grafana/runtime';
import { TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';
import type {
  ZabbixDirectMetadata,
  ZabbixHostInterfaceItems,
  ZabbixInterfaceHostRef,
  ZabbixInterfaceItem,
  ZabbixItemLastValue,
} from '../utils/zabbixApi';
import type { HostProblemsMap } from '../utils/noc/types';

export const PLUGIN_RESOURCES = `/api/plugins/${TOPOLOGY_PLUGIN_ID}/resources`;

export type PluginLicenseState =
  | { status: 'valid'; storeVersion?: string; grafanaIp?: string }
  | { status: 'blocked'; message: string; retryable?: boolean; grafanaIp?: string };

type PluginLicenseResponse = {
  valid?: boolean;
  message?: string;
  retryable?: boolean;
  storeVersion?: string;
  grafanaIp?: string;
};

export type BackendLiveSnapshot = {
  savedAt: number;
  metadata: ZabbixDirectMetadata;
  knownStatusItems: ZabbixInterfaceItem[];
  lastValues: Record<string, ZabbixItemLastValue>;
  interfaceItems: ZabbixInterfaceItem[];
  problems: HostProblemsMap;
};

function encodeSnapshotKey(key: string): string {
  const bytes = new TextEncoder().encode(key);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function backendFetch<T>(request: {
  url: string;
  method?: string;
  data?: unknown;
  params?: Record<string, string>;
  abortSignal?: AbortSignal;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    getBackendSrv()
      .fetch<T>({
        url: request.url,
        method: request.method ?? 'GET',
        data: request.data,
        params: request.params,
        showErrorAlert: false,
        hideFromInspector: true,
        ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      })
      .subscribe({
        next: (response) => resolve(response.data),
        error: reject,
      });
  });
}

function mapLicense(body: PluginLicenseResponse): PluginLicenseState {
  if (body.valid) {
    return {
      status: 'valid',
      storeVersion: body.storeVersion,
      grafanaIp: body.grafanaIp,
    };
  }
  return {
    status: 'blocked',
    message:
      body.message?.trim() ||
      'Licença inválida. Confira a instalação e o IP em Minha conta na loja.',
    retryable: body.retryable,
    grafanaIp: body.grafanaIp,
  };
}

function licenseFetchError(err: unknown): PluginLicenseState {
  const status = (err as { status?: number }).status;
  if (status === 404) {
    return {
      status: 'blocked',
      retryable: true,
      message: 'Reinicie o Grafana depois de atualizar o plugin. O backend ainda não está no ar.',
    };
  }
  return {
    status: 'blocked',
    retryable: true,
    message: 'Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.',
  };
}

export async function fetchPluginLicense(pageHost = ''): Promise<PluginLicenseState> {
  const host = pageHost.trim();
  try {
    const body = await backendFetch<PluginLicenseResponse>({
      url: `${PLUGIN_RESOURCES}/license`,
      params: host ? { host } : undefined,
    });
    return mapLicense(body ?? {});
  } catch (err) {
    return licenseFetchError(err);
  }
}

const inflightLookups = new Map<string, Promise<BackendLiveSnapshot | undefined>>();

export async function fetchLiveSnapshot(key: string): Promise<BackendLiveSnapshot | undefined> {
  const pending = inflightLookups.get(key);
  if (pending) {
    return pending;
  }
  const lookup = lookupLiveSnapshot(key).finally(() => {
    inflightLookups.delete(key);
  });
  inflightLookups.set(key, lookup);
  return lookup;
}

async function lookupLiveSnapshot(key: string): Promise<BackendLiveSnapshot | undefined> {
  const encoded = encodeSnapshotKey(key);
  try {
    const data = await backendFetch<BackendLiveSnapshot>({
      url: `${PLUGIN_RESOURCES}/snapshot`,
      method: 'POST',
      data: { key: encoded },
    });
    if (!data?.metadata || !Array.isArray(data.knownStatusItems)) {
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}

export type BackendPollRequest = {
  datasourceUid: string;
  groupNames: string[];
  statusItemKey: string;
  trafficItemIds: string[];
  trafficKeys: string[];
  refreshSec: number;
};

export type BackendPollResponse = {
  snapshot: BackendLiveSnapshot;
  ready: boolean;
  loading: boolean;
  error?: string;
};

export async function fetchBackendPoll(
  request: BackendPollRequest
): Promise<BackendPollResponse | undefined> {
  try {
    const data = await backendFetch<BackendPollResponse>({
      url: `${PLUGIN_RESOURCES}/poll`,
      method: 'POST',
      data: request,
    });
    if (!data?.snapshot?.metadata || !Array.isArray(data.snapshot.knownStatusItems)) {
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}

function throwIfBackendError(error?: string): void {
  const trimmed = error?.trim();
  if (trimmed) {
    throw new Error(trimmed);
  }
}

export async function fetchBackendHostGroups(datasourceUid: string): Promise<string[]> {
  const data = await backendFetch<{ groups?: string[]; error?: string }>({
    url: `${PLUGIN_RESOURCES}/groups`,
    method: 'POST',
    data: { datasourceUid },
  });
  throwIfBackendError(data?.error);
  return Array.isArray(data?.groups) ? data.groups : [];
}

export async function fetchBackendItemNames(datasourceUid: string, groupNames: string[]): Promise<string[]> {
  const data = await backendFetch<{ names?: string[]; error?: string }>({
    url: `${PLUGIN_RESOURCES}/item-names`,
    method: 'POST',
    data: { datasourceUid, groupNames },
  });
  throwIfBackendError(data?.error);
  return Array.isArray(data?.names) ? data.names : [];
}

export async function fetchBackendHostInterfaces(
  datasourceUid: string,
  hosts: ZabbixInterfaceHostRef[],
  searchKeys: string[]
): Promise<ZabbixHostInterfaceItems[]> {
  const data = await backendFetch<{ entries?: ZabbixHostInterfaceItems[]; error?: string }>({
    url: `${PLUGIN_RESOURCES}/interfaces`,
    method: 'POST',
    data: { datasourceUid, hosts, searchKeys },
  });
  throwIfBackendError(data?.error);
  return Array.isArray(data?.entries) ? data.entries : [];
}

export type HostIcmpStatus = {
  reachable: boolean | null;
  lossPct: number | null;
  rttMs: number | null;
  lastClock?: number;
  error?: string;
};

export type BackendPingResult = {
  success: boolean;
  output: string;
  error?: string;
  icmp?: HostIcmpStatus;
};

export async function fetchBackendPing(
  datasourceUid: string,
  hostName: string,
  mode: 'panel' | 'continuous' = 'panel'
): Promise<BackendPingResult> {
  const data = await backendFetch<BackendPingResult>({
    url: `${PLUGIN_RESOURCES}/ping`,
    method: 'POST',
    data: { datasourceUid, hostName, mode },
  });
  return {
    success: Boolean(data?.success),
    output: data?.output ?? '',
    error: data?.error,
    icmp: data?.icmp,
  };
}

export { encodeSnapshotKey };
