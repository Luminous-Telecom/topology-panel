import React, { useEffect, useState } from 'react';
import { Field, Input, Stack } from '@grafana/ui';
import { fetchInstalledLicenseFile, fetchLicenseStatus } from '../../services/licenseClient';
import { maskLicenseKey } from '../../utils/licenseInstall';

/** Mostra a licença gravada na instalação e os IPs da loja (somente leitura). */
export function LicenseStatusEditor() {
  const [key, setKey] = useState('');
  const [url, setUrl] = useState('');
  const [ips, setIps] = useState<string[]>([]);
  const [hint, setHint] = useState('Carregando licença da instalação…');

  useEffect(() => {
    let cancelled = false;
    fetchInstalledLicenseFile().then((file) => {
      if (cancelled) {
        return;
      }
      if (!file) {
        setHint('Rode o comando de instalação da loja neste Grafana. Nada se preenche à mão aqui.');
        return;
      }
      setKey(file.licenseKey);
      setUrl(file.licenseApiUrl);
      fetchLicenseStatus(file.licenseApiUrl, file.licenseKey).then((status) => {
        if (cancelled) {
          return;
        }
        if (status.kind === 'ok') {
          setIps(status.authorizedIps);
          setHint(
            status.authorizedIps.length
              ? 'IP só se altera em Minha conta na loja.'
              : 'Cadastre o IP deste Grafana em Minha conta na loja.'
          );
          return;
        }
        setHint(status.message);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack direction="column" gap={1}>
      <Field label="Chave de licença" description="Gravada pelo comando de instalação. Não se edita no painel.">
        <Input value={key ? maskLicenseKey(key) : ''} readOnly disabled />
      </Field>
      <Field label="URL da loja" description="Gravada na instalação.">
        <Input value={url} readOnly disabled />
      </Field>
      <Field label="IP do Grafana" description="Somente leitura. Altere em Minha conta na Luminous Store.">
        <Input value={ips.join(', ')} readOnly disabled placeholder="Nenhum IP cadastrado na loja" />
      </Field>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{hint}</span>
    </Stack>
  );
}
