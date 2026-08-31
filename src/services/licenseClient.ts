import { createAsyncCache } from './asyncCache';
import { licenseRejectMessage, TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';
import {
  installedLicenseFileUrl,
  licenseStatusUrl,
  parseInstalledLicenseFile,
  type InstalledLicenseFile,
} from '../utils/licenseInstall';
import { PLUGIN_VERSION } from '../utils/pluginVersion';

export type LicenseFetchResult =
  | { kind: 'valid'; storeVersion?: string }
  | { kind: 'invalid'; message: string; retryable: boolean };

export type LicenseStatusFetch =
  | { kind: 'ok'; authorizedIps: string[]; storeVersion?: string; pluginId?: string }
  | { kind: 'invalid'; message: string; retryable: boolean };

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const licenseCache = createAsyncCache<LicenseFetchResult>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 8,
  isCacheable: (value) => value.kind === 'valid' || !value.retryable,
});

const statusCache = createAsyncCache<LicenseStatusFetch>({
  ttlMs: 30_000,
  maxEntries: 8,
  isCacheable: (value) => value.kind === 'ok' || !value.retryable,
});

export function licenseCacheKey(apiUrl: string, licenseKey: string, ip: string, pluginVersion: string): string {
  return `${apiUrl}\0${licenseKey}\0${ip}\0${pluginVersion}`;
}

export async function fetchInstalledLicenseFile(): Promise<InstalledLicenseFile | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(installedLicenseFileUrl(), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }
    return parseInstalledLicenseFile(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLicenseStatus(apiUrl: string, licenseKey: string): Promise<LicenseStatusFetch> {
  return statusCache.get(`${apiUrl}\0${licenseKey}`, () => requestLicenseStatus(apiUrl, licenseKey));
}

async function requestLicenseStatus(apiUrl: string, licenseKey: string): Promise<LicenseStatusFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(licenseStatusUrl(apiUrl), {
      method: 'GET',
      headers: { 'X-License-Key': licenseKey },
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        kind: 'invalid',
        retryable: response.status >= 500,
        message:
          response.status === 401
            ? 'Licença inválida. Rode de novo o comando de instalação da loja.'
            : 'A loja não pôde consultar a licença agora. Tente de novo em instantes.',
      };
    }
    const body = (await response.json()) as {
      authorizedIps?: unknown;
      pluginVersion?: string;
      pluginId?: string;
    };
    const authorizedIps = Array.isArray(body.authorizedIps)
      ? body.authorizedIps.filter((ip): ip is string => typeof ip === 'string')
      : [];
    if (body.pluginId && body.pluginId !== TOPOLOGY_PLUGIN_ID) {
      return {
        kind: 'invalid',
        retryable: false,
        message: 'Esta chave não é do Topology Panel.',
      };
    }
    return {
      kind: 'ok',
      authorizedIps,
      storeVersion: typeof body.pluginVersion === 'string' ? body.pluginVersion : undefined,
      pluginId: typeof body.pluginId === 'string' ? body.pluginId : undefined,
    };
  } catch {
    return {
      kind: 'invalid',
      retryable: true,
      message: 'Não foi possível consultar a loja. Confira a rede deste Grafana.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLicenseValidation(
  apiUrl: string,
  licenseKey: string,
  ip: string
): Promise<LicenseFetchResult> {
  return licenseCache.get(licenseCacheKey(apiUrl, licenseKey, ip, PLUGIN_VERSION), () =>
    requestLicenseValidation(apiUrl, licenseKey, ip)
  );
}

async function requestLicenseValidation(
  apiUrl: string,
  licenseKey: string,
  ip: string
): Promise<LicenseFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
      body: JSON.stringify({ licenseKey, ip, pluginVersion: PLUGIN_VERSION }),
    });
    if (!response.ok) {
      return {
        kind: 'invalid',
        retryable: response.status >= 500,
        message: 'A loja não pôde validar a licença agora. Tente de novo em instantes.',
      };
    }
    const body = (await response.json()) as {
      valid?: boolean;
      reason?: string | null;
      pluginId?: string | null;
      pluginVersion?: string | null;
    };
    if (body.valid === true) {
      if (body.pluginId && body.pluginId !== TOPOLOGY_PLUGIN_ID) {
        return {
          kind: 'invalid',
          retryable: false,
          message: 'Esta chave não é do Topology Panel.',
        };
      }
      return {
        kind: 'valid',
        storeVersion: typeof body.pluginVersion === 'string' ? body.pluginVersion : undefined,
      };
    }
    return {
      kind: 'invalid',
      retryable: false,
      message: licenseRejectMessage(body.reason),
    };
  } catch {
    return {
      kind: 'invalid',
      retryable: true,
      message: 'Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.',
    };
  } finally {
    clearTimeout(timer);
  }
}
