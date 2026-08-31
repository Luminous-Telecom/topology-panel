import React, { useEffect, useState } from 'react';
import { Input } from '@grafana/ui';
import { fetchInstalledLicenseFile, fetchLicenseStatus } from '../../services/licenseClient';

/** IP cadastrado na loja (somente leitura). Chave e URL ficam só no license.json da instalação. */
export function LicenseStatusEditor() {
  const [ips, setIps] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchInstalledLicenseFile().then((file) => {
      if (cancelled || !file) {
        return;
      }
      fetchLicenseStatus(file.licenseApiUrl, file.licenseKey).then((status) => {
        if (!cancelled && status.kind === 'ok') {
          setIps(status.authorizedIps);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <Input value={ips.join(', ')} readOnly disabled />;
}
