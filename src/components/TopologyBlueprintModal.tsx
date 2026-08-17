import React, { useId, useMemo, useState } from 'react';
import { Button, Modal, Select, Stack } from '@grafana/ui';
import { TopologyBlueprint } from '../types';
import { resolvePanelTemplates } from '../utils/topologyTemplates/resolveTemplates';
import { TopologyPanelOptions } from '../types';

interface Props {
  options: Pick<TopologyPanelOptions, 'topologyTemplates'>;
  onApply: (blueprint: TopologyBlueprint) => void;
  onClose: () => void;
}

export function TopologyBlueprintModal({ options, onApply, onClose }: Props) {
  const uid = useId();
  const blueprints = useMemo(() => resolvePanelTemplates(options).topologyBlueprints, [options]);
  const [selectedId, setSelectedId] = useState(blueprints[0]?.id ?? '');

  const selected = blueprints.find((b) => b.id === selectedId) ?? blueprints[0];

  return (
    <Modal title="Modelo de topologia" isOpen onDismiss={onClose}>
      <Stack gap={2}>
        <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.9 }}>
          Insere nós e links de um modelo (POP, backbone, FTTH). Os hosts podem ser vinculados ao
          Zabbix depois.
        </div>

        <div>
          <label htmlFor={`${uid}-blueprint`} style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Modelo
          </label>
          <Select
            inputId={`${uid}-blueprint`}
            options={blueprints.map((b) => ({ label: b.name, value: b.id }))}
            value={selectedId}
            onChange={(v) => {
              if (v?.value) {
                setSelectedId(v.value);
              }
            }}
          />
        </div>

        {selected?.description ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>{selected.description}</div>
        ) : null}

        {selected ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {selected.roles.length} nó(s)
            {selected.links?.length ? ` · ${selected.links.length} link(s)` : ''}
            {selected.networkBox ? ' · rede container' : ''}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!selected} onClick={() => selected && onApply(selected)}>
            Inserir modelo
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
