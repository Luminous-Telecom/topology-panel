import { getBackendSrv } from '@grafana/runtime';
import { TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';
import type { ZabbixDirectMetadata, ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
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
        abortSignal: request.abortSignal,
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

export async function fetchLiveSnapshot(
  key: string,
  pageHost = ''
): Promise<BackendLiveSnapshot | undefined> {
  const host = pageHost.trim();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const data = await backendFetch<BackendLiveSnapshot>({
      url: `${PLUGIN_RESOURCES}/snapshot`,
      params: {
        key: encodeSnapshotKey(key),
        ...(host ? { host } : {}),
      },
      abortSignal: controller.signal,
    });
    if (!data?.metadata || !Array.isArray(data.knownStatusItems)) {
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function persistLiveSnapshot(
  key: string,
  snapshot: BackendLiveSnapshot,
  pageHost = ''
): Promise<void> {
  const host = pageHost.trim();
  try {
    await backendFetch<unknown>({
      url: `${PLUGIN_RESOURCES}/snapshot`,
      method: 'POST',
      params: host ? { host } : undefined,
      data: { ...snapshot, key: encodeSnapshotKey(key) },
    });
  } catch {
    return;
  }
}

export { encodeSnapshotKey };
