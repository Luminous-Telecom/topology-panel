import { useEffect, useState } from 'react';
import { fetchPluginLicense } from '../services/pluginBackend';
import { isLicenseEnforced } from '../utils/licenseValidation';

/** Alinhado ao `licenseCacheTTL` do backend Go — a loja é consultada de novo sem reiniciar o Grafana. */
export const LICENSE_REFRESH_MS = 30_000;

export type LicenseCheckState =
  | { status: 'skipped' }
  | { status: 'loading' }
  | { status: 'valid'; storeVersion?: string }
  | { status: 'blocked'; message: string };

export function useLicenseValidation(): LicenseCheckState {
  const [state, setState] = useState<LicenseCheckState>(() =>
    isLicenseEnforced() ? { status: 'loading' } : { status: 'skipped' }
  );

  useEffect(() => {
    if (!isLicenseEnforced()) {
      setState({ status: 'skipped' });
      return;
    }
    let cancelled = false;
    const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const refresh = () => {
      fetchPluginLicense(pageHost).then((next) => {
        if (cancelled) {
          return;
        }
        if (next.status === 'valid') {
          setState({ status: 'valid', storeVersion: next.storeVersion });
          return;
        }
        setState({ status: 'blocked', message: next.message });
      });
    };
    refresh();
    const intervalId = window.setInterval(refresh, LICENSE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return state;
}
