import React, { useEffect, useState } from 'react';
import { Field, Input, Stack } from '@grafana/ui';
import { fetchPluginLicense } from '../../services/pluginBackend';
import { PLUGIN_VERSION, pluginVersionIsNewer } from '../../utils/pluginVersion';

/** IP deste Grafana (somente leitura) e versão do plugin. */
export function LicenseStatusEditor() {
  const [grafanaIp, setGrafanaIp] = useState('');
  const [storeVersion, setStoreVersion] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
    fetchPluginLicense(pageHost).then((license) => {
      if (cancelled) {
        return;
      }
      if (license.grafanaIp) {
        setGrafanaIp(license.grafanaIp);
      }
      if (license.status === 'valid' && license.storeVersion) {
        setStoreVersion(license.storeVersion);
      }
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
