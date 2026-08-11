import React from 'react';
import { useTheme2 } from '@grafana/ui';

interface Props {
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Visualmente equivalente ao <Field label> do Grafana, mas sem <label>/htmlFor.
 *
 * Usar quando o conteúdo não é um único campo de formulário controlável (texto
 * só leitura, grade de botões, bloco de resultado/lista) — um <Field> normal
 * nesses casos gera um <label> órfão (sem "for" válido), que o DevTools reporta
 * como "No label associated with a form field".
 */
export function FieldReadout({ label, description, children }: Props) {
  const theme = useTheme2();
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', marginBottom: theme.spacing(2) }}
    >
      <div
        style={{
          fontSize: theme.typography.size.sm,
          fontWeight: theme.typography.fontWeightMedium,
          lineHeight: 1.25,
          marginBottom: theme.spacing(0.5),
          color: theme.colors.text.primary,
          maxWidth: 480,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>{label}</div>
        {description ? (
          <div
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.size.sm,
              fontWeight: theme.typography.fontWeightRegular,
              marginTop: theme.spacing(0.25),
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}
