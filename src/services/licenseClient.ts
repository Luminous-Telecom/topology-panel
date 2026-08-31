import { createAsyncCache } from './asyncCache';
import { licenseRejectMessage, TOPOLOGY_PLUGIN_ID } from '../utils/licenseValidation';

export type LicenseFetchResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; message: string; retryable: boolean };

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const licenseCache = createAsyncCache<LicenseFetchResult>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 8,
  isCacheable: (value) => value.kind === 'valid' || !value.retryable,
});

export function licenseCacheKey(apiUrl: string, licenseKey: string, ip: string): string {
  return `${apiUrl}\0${licenseKey}\0${ip}`;
}

export async function fetchLicenseValidation(
  apiUrl: string,
  licenseKey: string,
  ip: string
): Promise<LicenseFetchResult> {
  return licenseCache.get(licenseCacheKey(apiUrl, licenseKey, ip), () =>
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
      body: JSON.stringify({ licenseKey, ip }),
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
    };
    if (body.valid === true) {
      if (body.pluginId && body.pluginId !== TOPOLOGY_PLUGIN_ID) {
        return {
          kind: 'invalid',
          retryable: false,
          message: 'Esta chave não é do Topology Panel.',
        };
      }
      return { kind: 'valid' };
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
