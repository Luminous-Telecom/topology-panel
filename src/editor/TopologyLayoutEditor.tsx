import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Alert, Button, Field, Input, Stack } from '@grafana/ui';
import { TopologyMap, TopologyPanelOptions } from '../types';
import { useTopologyMapEditor } from '../hooks/useTopologyMapEditor';
import { EditorLockBar } from './sections/EditorLockBar';
import { TopologyJsonEditor } from './sections/TopologyJsonEditor';

type Props = StandardEditorProps<TopologyMap, TopologyPanelOptions>;

/** Aba Layout: dimensões do canvas, trava e importação JSON. */
export function TopologyLayoutEditor(props: Props) {
  const {
    uid,
    map,
    locked,
    jsonMode,
    jsonText,
    jsonError,
    setJsonText,
    setJsonMode,
    updateMap,
    toggleLock,
    applyJson,
    openJsonMode,
  } = useTopologyMapEditor(props);

  if (jsonMode) {
    return (
      <Stack direction="column" gap={2}>
        <EditorLockBar locked={locked} onToggle={toggleLock} />
        <TopologyJsonEditor
          uid={uid}
          locked={locked}
          text={jsonText}
          error={jsonError}
          onTextChange={setJsonText}
          onApply={applyJson}
          onBack={() => setJsonMode(false)}
        />
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap={2}>
      <EditorLockBar locked={locked} onToggle={toggleLock} />

      {locked && (
        <Alert title="Edição bloqueada" severity="warning">
          Posições, submapas e links estão travados. Clique no cadeado para destravar.
        </Alert>
      )}

      {!locked && (
        <Alert title="Edição no mapa" severity="info">
          Arraste nós no canvas (destravado). Hosts, submapas e links têm abas próprias neste painel.
        </Alert>
      )}

      <Field label="Largura do mapa">
        <Input
          id={`${uid}-map-width`}
          type="number"
          value={map.width}
          disabled={locked}
          onChange={(e) => {
            const width = Number(e.currentTarget.value);
            if (Number.isFinite(width) && width > 0) {
              updateMap({ width: Math.round(width) });
            }
          }}
        />
      </Field>
      <Field label="Altura do mapa">
        <Input
          id={`${uid}-map-height`}
          type="number"
          value={map.height}
          disabled={locked}
          onChange={(e) => {
            const height = Number(e.currentTarget.value);
            if (Number.isFinite(height) && height > 0) {
              updateMap({ height: Math.round(height) });
            }
          }}
        />
      </Field>

      <Button variant="secondary" disabled={locked} onClick={openJsonMode}>
        Importar / exportar JSON
      </Button>
    </Stack>
  );
}
