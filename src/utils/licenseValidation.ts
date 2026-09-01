export const TOPOLOGY_PLUGIN_ID = 'luminous-topology-panel';

export function isLocalDevelopmentHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function isLicenseEnforced(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }
  if (typeof window !== 'undefined' && isLocalDevelopmentHost(window.location.hostname)) {
    return false;
  }
  return true;
}
