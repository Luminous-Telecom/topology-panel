import { isIpv4 } from './ipv4';
import { TOPOLOGY_PLUGIN_ID } from './licenseValidation';

export type InstalledLicenseFile = {
  licenseKey: string;
  licenseApiUrl: string;
  /** IP público do servidor Grafana, gravado na instalação. Não é o IP da loja. */
  grafanaIp?: string;
};

export function installedLicenseFileUrl(): string {
  return `/public/plugins/${TOPOLOGY_PLUGIN_ID}/license.json`;
}

export function licenseStatusUrl(validateUrl: string): string {
  const trimmed = validateUrl.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/validate')) {
    return `${trimmed.slice(0, -'/validate'.length)}/status`;
  }
  return `${trimmed}/status`;
}

export function parseInstalledLicenseFile(raw: unknown): InstalledLicenseFile | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const rec = raw as { licenseKey?: unknown; licenseApiUrl?: unknown; grafanaIp?: unknown };
  const licenseKey = typeof rec.licenseKey === 'string' ? rec.licenseKey.trim() : '';
  const licenseApiUrl = typeof rec.licenseApiUrl === 'string' ? rec.licenseApiUrl.trim() : '';
  if (!licenseKey || !licenseApiUrl) {
    return undefined;
  }
  const grafanaIp = typeof rec.grafanaIp === 'string' ? rec.grafanaIp.trim() : '';
  return {
    licenseKey,
    licenseApiUrl,
    ...(isIpv4(grafanaIp) ? { grafanaIp } : {}),
  };
}

export function maskLicenseKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

/** IP deste Grafana: host da página se for IPv4, senão o IP gravado na instalação. */
export function resolveGrafanaServerIp(pageHostname: string, installedGrafanaIp?: string): string | undefined {
  const host = pageHostname.trim();
  if (isIpv4(host)) {
    return host;
  }
  const installed = installedGrafanaIp?.trim() ?? '';
  return isIpv4(installed) ? installed : undefined;
}

/** Só valida se o IP deste Grafana está na lista da licença (Minha conta), não o IP do servidor da loja. */
export function matchAuthorizedGrafanaIp(
  grafanaIp: string | undefined,
  authorizedIps: string[]
): string | undefined {
  if (!grafanaIp || !isIpv4(grafanaIp)) {
    return undefined;
  }
  for (const ip of authorizedIps) {
    if (ip.trim() === grafanaIp) {
      return grafanaIp;
    }
  }
  return undefined;
}
