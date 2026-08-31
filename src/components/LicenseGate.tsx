import React from 'react';
import { GrafanaTheme2 } from '@grafana/data';
import type { LicenseCheckState } from '../hooks/useLicenseValidation';

export function LicenseGate({
  state,
  width,
  height,
  theme,
  children,
}: {
  state: LicenseCheckState;
  width: number;
  height: number;
  theme: GrafanaTheme2;
  children: React.ReactNode;
}) {
  if (state.status === 'skipped' || state.status === 'valid') {
    return <>{children}</>;
  }

  const title = state.status === 'loading' ? 'Validando licença…' : 'Licença necessária';
  const body =
    state.status === 'loading'
      ? 'Consultando a loja. O mapa abre quando a chave for aceita.'
      : state.message;

  return (
    <div
      style={{
        width,
        height,
        background: theme.colors.background.primary,
        color: state.status === 'loading' ? theme.colors.text.primary : theme.colors.error.text,
        overflow: 'auto',
        padding: 16,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <strong>{title}</strong>
      <div style={{ marginTop: 8 }}>{body}</div>
    </div>
  );
}
