import { useEffect, useState } from 'react';
import {
  fetchInstalledLicenseFile,
  fetchLicenseStatus,
  fetchLicenseValidation,
  type LicenseFetchResult,
} from '../services/licenseClient';
import { isLicenseEnforced, resolveLicenseGate } from '../utils/licenseValidation';
import { pickAuthorizedIp } from '../utils/licenseInstall';

export type LicenseCheckState =
  | { status: 'skipped' }
  | { status: 'loading' }
  | { status: 'valid'; storeVersion?: string }
  | { status: 'blocked'; message: string };

export function useLicenseValidation(): LicenseCheckState {
  const [fileState, setFileState] = useState<
    { status: 'loading' } | { status: 'missing' } | { status: 'ready'; licenseKey: string; apiUrl: string }
  >({ status: 'loading' });
  const [result, setResult] = useState<LicenseFetchResult | undefined>(undefined);

  useEffect(() => {
    if (!isLicenseEnforced()) {
      return;
    }
    let cancelled = false;
    fetchInstalledLicenseFile().then((file) => {
      if (cancelled) {
        return;
      }
      if (!file) {
        setFileState({ status: 'missing' });
        return;
      }
      setFileState({ status: 'ready', licenseKey: file.licenseKey, apiUrl: file.licenseApiUrl });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const gate = resolveLicenseGate({
    enforced: isLicenseEnforced(),
    licenseKey: fileState.status === 'ready' ? fileState.licenseKey : '',
    licenseApiUrl: fileState.status === 'ready' ? fileState.apiUrl : '',
  });

  const readyUrl = gate.status === 'ready' ? gate.apiUrl : '';
  const readyKey = gate.status === 'ready' ? gate.licenseKey : '';

  useEffect(() => {
    if (!readyUrl || !readyKey) {
      setResult(undefined);
      return;
    }
    let cancelled = false;
    setResult(undefined);
    fetchLicenseStatus(readyUrl, readyKey)
      .then((status) => {
        if (cancelled) {
          return undefined;
        }
        if (status.kind === 'invalid') {
          setResult({ kind: 'invalid', message: status.message, retryable: status.retryable });
          return undefined;
        }
        const ip = pickAuthorizedIp(status.authorizedIps);
        if (!ip) {
          setResult({
            kind: 'invalid',
            retryable: false,
            message: 'Cadastre o IP deste Grafana em Minha conta na loja. O painel não edita IP.',
          });
          return undefined;
        }
        return fetchLicenseValidation(readyUrl, readyKey, ip);
      })
      .then((next) => {
        if (!cancelled && next) {
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
  }, [readyUrl, readyKey]);

  if (gate.status === 'skip') {
    return { status: 'skipped' };
  }
  if (fileState.status === 'loading') {
    return { status: 'loading' };
  }
  if (fileState.status === 'missing') {
    return {
      status: 'blocked',
      message: 'Rode o comando de instalação da loja neste Grafana. A chave e a URL são gravadas na instalação.',
    };
  }
  if (gate.status === 'blocked') {
    return { status: 'blocked', message: gate.message };
  }
  if (!result) {
    return { status: 'loading' };
  }
  if (result.kind === 'valid') {
    return { status: 'valid', storeVersion: result.storeVersion };
  }
  return { status: 'blocked', message: result.message };
}
