import { useEffect, useState } from 'react';
import { fetchLicenseValidation, type LicenseFetchResult } from '../services/licenseClient';
import { isLicenseEnforced, resolveLicenseGate } from '../utils/licenseValidation';

export type LicenseCheckState =
  | { status: 'skipped' }
  | { status: 'loading' }
  | { status: 'valid' }
  | { status: 'blocked'; message: string };

export function useLicenseValidation(options: {
  licenseKey?: string;
  licenseApiUrl?: string;
  licenseIp?: string;
}): LicenseCheckState {
  const pageHostname = typeof window === 'undefined' ? '' : window.location.hostname;
  const gate = resolveLicenseGate({
    enforced: isLicenseEnforced(),
    licenseKey: options.licenseKey,
    licenseApiUrl: options.licenseApiUrl,
    licenseIp: options.licenseIp,
    pageHostname,
  });

  const readyUrl = gate.status === 'ready' ? gate.apiUrl : '';
  const readyKey = gate.status === 'ready' ? gate.licenseKey : '';
  const readyIp = gate.status === 'ready' ? gate.ip : '';

  const [result, setResult] = useState<LicenseFetchResult | undefined>(undefined);

  useEffect(() => {
    if (!readyUrl || !readyKey || !readyIp) {
      setResult(undefined);
      return;
    }
    let cancelled = false;
    setResult(undefined);
    fetchLicenseValidation(readyUrl, readyKey, readyIp)
      .then((next) => {
        if (!cancelled) {
          setResult(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            kind: 'invalid',
            retryable: true,
            message: 'Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [readyUrl, readyKey, readyIp]);

  if (gate.status === 'skip') {
    return { status: 'skipped' };
  }
  if (gate.status === 'blocked') {
    return { status: 'blocked', message: gate.message };
  }
  if (!result) {
    return { status: 'loading' };
  }
  if (result.kind === 'valid') {
    return { status: 'valid' };
  }
  return { status: 'blocked', message: result.message };
}
