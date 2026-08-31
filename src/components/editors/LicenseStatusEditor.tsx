import React, { useEffect, useState } from 'react';
import { Field, Input, Stack } from '@grafana/ui';
import { fetchInstalledLicenseFile, fetchLicenseStatus } from '../../services/licenseClient';
import { maskLicenseKey } from '../../utils/licenseInstall';

/** Mostra a licença gravada na instalação e os IPs da loja (somente leitura). */
export function LicenseStatusEditor() {
  const [key, setKey] = useState('');
  const [url, setUrl] = useState('');
  const [ips, setIps] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchInstalledLicenseFile().then((file) => {
      if (cancelled || !file) {
        return;
      }
      setKey(file.licenseKey);
      setUrl(file.licenseApiUrl);
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

  return (
    <Stack direction="column" gap={1}>
      <Field label="Chave de licença">
        <Input value={key ? maskLicenseKey(key) : ''} readOnly disabled />
      </Field>
      <Field label="URL da loja">
        <Input value={url} readOnly disabled />
      </Field>
      <Field label="IP do Grafana">
        <Input value={ips.join(', ')} readOnly disabled />
      </Field>
    </Stack>
  );
}
