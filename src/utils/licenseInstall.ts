import { isIpv4 } from './ipv4';
import { TOPOLOGY_PLUGIN_ID } from './licenseValidation';

export type InstalledLicenseFile = {
  licenseKey: string;
  licenseApiUrl: string;
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
  const rec = raw as { licenseKey?: unknown; licenseApiUrl?: unknown };
  const licenseKey = typeof rec.licenseKey === 'string' ? rec.licenseKey.trim() : '';
  const licenseApiUrl = typeof rec.licenseApiUrl === 'string' ? rec.licenseApiUrl.trim() : '';
  if (!licenseKey || !licenseApiUrl) {
    return undefined;
  }
  return { licenseKey, licenseApiUrl };
}

export function maskLicenseKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

export function pickAuthorizedIp(ips: string[]): string | undefined {
  for (const ip of ips) {
    if (isIpv4(ip)) {
      return ip;
    }
  }
  return undefined;
}
