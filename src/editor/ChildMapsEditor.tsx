import React, { useCallback, useId, useMemo, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, Field, Input, Stack } from '@grafana/ui';
import { TopologyMap, TopologyPanelOptions, parseTopologyJson, topologyToJson } from '../types';
import { ensureChildMapEntry } from '../utils/childMapEdits';
import { isValidChildMapId } from '../utils/topologyMapNavigation';
import { FieldReadout } from '../components/FieldReadout';
import { TopologyJsonEditor } from './sections/TopologyJsonEditor';

type Props = StandardEditorProps<Record<string, TopologyMap> | undefined, TopologyPanelOptions>;

/** Editor dos mapas internos referenciados por submapas (`submapChildMapId`). */
export function ChildMapsEditor({ value, onChange }: Props) {
  const uid = useId();
  const childMaps = value ?? {};
  const [newMapId, setNewMapId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const ids = useMemo(() => Object.keys(childMaps).sort(), [childMaps]);
  const selectedMap = selectedId ? childMaps[selectedId] : undefined;

  const addMap = useCallback(() => {
    const trimmed = newMapId.trim();
    if (!isValidChildMapId(trimmed)) {
      return;
    }
    const next = ensureChildMapEntry(childMaps, trimmed);
    if (!next) {
      return;
    }
    onChange(next);
    setSelectedId(trimmed);
    setNewMapId('');
  }, [childMaps, newMapId, onChange]);

  const removeMap = useCallback(
    (mapId: string) => {
      const next = { ...childMaps };
      delete next[mapId];
      onChange(Object.keys(next).length > 0 ? next : undefined);
      if (selectedId === mapId) {
        setSelectedId(null);
        setJsonMode(false);
      }
    },
    [childMaps, onChange, selectedId]
  );

  const updateSelectedMap = useCallback(
    (map: TopologyMap) => {
      if (!selectedId) {
        return;
      }
      onChange({ ...childMaps, [selectedId]: map });
    },
    [childMaps, onChange, selectedId]
  );

  const openJson = useCallback(() => {
    if (!selectedMap) {
      return;
    }
    setJsonText(topologyToJson(selectedMap));
    setJsonError(null);
    setJsonMode(true);
  }, [selectedMap]);

  const applyJson = useCallback(() => {
    const parsed = parseTopologyJson(jsonText);
    if (!parsed) {
      setJsonError('JSON inválido ou estrutura incorreta');
      return;
    }
    updateSelectedMap(parsed);
    setJsonMode(false);
    setJsonError(null);
  }, [jsonText, updateSelectedMap]);

  return (
    <FieldReadout
      label={`Mapas internos (${ids.length})`}
      description="Mapas filhos navegáveis dentro do painel. Vincule pelo campo Mapa interno nos submapas."
    >
      <Stack direction="column" gap={1}>
        <Stack direction="row" gap={1} alignItems="flex-end">
          <Field label="Novo mapa (id)" style={{ flex: 1, marginBottom: 0 }}>
            <Input
              id={`${uid}-child-map-id`}
              value={newMapId}
              placeholder="ex.: nordeste"
              onChange={(e) => setNewMapId(e.currentTarget.value)}
            />
          </Field>
          <Button onClick={addMap} disabled={!isValidChildMapId(newMapId)}>
            Criar
          </Button>
        </Stack>

        {ids.map((mapId) => (
          <Stack key={mapId} direction="row" gap={1} alignItems="center">
            <Button
              variant={selectedId === mapId ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setSelectedId(mapId);
                setJsonMode(false);
              }}
            >
              {mapId}
            </Button>
            <span style={{ fontSize: 12, color: '#888' }}>
              {childMaps[mapId]?.nodes.length ?? 0} nós
            </span>
            <Button variant="destructive" size="sm" onClick={() => removeMap(mapId)}>
              Remover
            </Button>
          </Stack>
        ))}

        {selectedMap && !jsonMode ? (
          <Stack direction="row" gap={1}>
            <Button size="sm" onClick={openJson}>
              Editar JSON
            </Button>
          </Stack>
        ) : null}

        {selectedMap && jsonMode ? (
          <TopologyJsonEditor
            uid={`${uid}-child-${selectedId ?? 'map'}`}
            locked={false}
            text={jsonText}
            error={jsonError}
            onTextChange={setJsonText}
            onApply={applyJson}
            onBack={() => setJsonMode(false)}
          />
        ) : null}
      </Stack>
    </FieldReadout>
  );
}
