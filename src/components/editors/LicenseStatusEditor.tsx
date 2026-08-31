import React, { useEffect, useState } from 'react';
import { Field, Input, Stack } from '@grafana/ui';
import { fetchInstalledLicenseFile, fetchLicenseStatus } from '../../services/licenseClient';
import { matchAuthorizedGrafanaIp, resolveGrafanaServerIp } from '../../utils/licenseInstall';
import { PLUGIN_VERSION, pluginVersionIsNewer } from '../../utils/pluginVersion';

/** IP deste Grafana (somente leitura) e versão do plugin. */
export function LicenseStatusEditor() {
  const [grafanaIp, setGrafanaIp] = useState('');
  const [storeVersion, setStoreVersion] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
    fetchInstalledLicenseFile().then((file) => {
      if (cancelled) {
        return;
      }
      const resolved = resolveGrafanaServerIp(pageHost, file?.grafanaIp);
      if (resolved) {
        setGrafanaIp(resolved);
      }
      if (!file) {
        return;
      }
      fetchLicenseStatus(file.licenseApiUrl, file.licenseKey).then((status) => {
        if (cancelled || status.kind !== 'ok') {
          return;
        }
        setStoreVersion(status.storeVersion);
        const matched = matchAuthorizedGrafanaIp(resolved, status.authorizedIps);
        if (matched) {
          setGrafanaIp(matched);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update =
    storeVersion && pluginVersionIsNewer(storeVersion, PLUGIN_VERSION) ? storeVersion : undefined;

  return (
    <Stack direction="column" gap={1}>
      <Input value={grafanaIp} readOnly disabled />
      <Field label="Versão">
        <Input
          value={update ? `v${PLUGIN_VERSION} · atualização ${update}` : `v${PLUGIN_VERSION}`}
          readOnly
          disabled
        />
      </Field>
    </Stack>
  );
}
