import React from 'react';
import { Alert, Button, Field, TextArea, useTheme2 } from '@grafana/ui';

interface TopologyJsonEditorProps {
  uid: string;
  locked: boolean;
  text: string;
  error: string | null;
  onTextChange: (text: string) => void;
  onApply: () => void;
  onBack: () => void;
}

/** Modo texto do mapa inteiro — usado para importar/exportar a topologia de uma vez. */
export function TopologyJsonEditor({
  uid,
  locked,
  text,
  error,
  onTextChange,
  onApply,
  onBack,
}: TopologyJsonEditorProps) {
  const theme = useTheme2();
  return (
    <>
      <Alert title="Importar / exportar topologia" severity="info">
        Cole o JSON completo do mapa (width, height, nodes, links) e clique em Aplicar.
      </Alert>
      <Field label="Topologia (JSON)">
        <TextArea
          id={`${uid}-json`}
          rows={16}
          value={text}
          disabled={locked}
          onChange={(e) => onTextChange(e.currentTarget.value)}
        />
      </Field>
      {error && <div style={{ color: theme.colors.error.text }}>{error}</div>}
      <Button onClick={onApply} disabled={locked}>
        Aplicar JSON
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Voltar ao editor
      </Button>
    </>
  );
}
