import { useEffect, useState } from 'react';
import { fetchPluginLicense } from '../services/pluginBackend';
import { isLicenseEnforced } from '../utils/licenseValidation';

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
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
