import React, { useMemo, useState } from 'react';
import { Button, Field, Input, Select } from '@grafana/ui';
import { DraggableModal } from './DraggableModal';
import { TopologyLink, TopologyLinkMedium } from '../types';
import { bandwidthToInput, parseBandwidthInput, LinkBandwidthUnit } from '../utils/linkBandwidth';

interface Props {
  link: TopologyLink;
  onSave: (patch: { medium?: TopologyLinkMedium; bandwidthMbps?: number }) => void;
  onClose: () => void;
}

const mediumOptions = [
  { label: 'Fibra (linha contínua)', value: 'fiber' },
  { label: 'Rádio (linha tracejada)', value: 'radio' },
];

const unitOptions = [
  { label: 'Mb', value: 'mbps' },
  { label: 'Gb', value: 'gbps' },
];

export function LinkEditModal({ link, onSave, onClose }: Props) {
  const initial = useMemo(() => bandwidthToInput(link.bandwidthMbps), [link.bandwidthMbps]);
  const [medium, setMedium] = useState<TopologyLinkMedium>(link.medium === 'radio' ? 'radio' : 'fiber');
  const [bandwidthValue, setBandwidthValue] = useState(initial.value);
  const [bandwidthUnit, setBandwidthUnit] = useState<LinkBandwidthUnit>(initial.unit);

  return (
    <DraggableModal title="Editar link" isOpen onDismiss={onClose}>
      <Field label="Tipo">
        <Select
          options={mediumOptions}
          value={medium}
          onChange={(v) => setMedium((v.value ?? 'fiber') as TopologyLinkMedium)}
        />
      </Field>
      <Field
        label="Capacidade"
        description="Largura da linha aumenta conforme Gb. Deixe vazio para usar espessura padrão."
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Input
            type="number"
            min={0}
            step="any"
            value={bandwidthValue}
            onChange={(e) => setBandwidthValue(e.currentTarget.value)}
            placeholder="Ex.: 1 ou 100"
            width={16}
          />
          <Select
            options={unitOptions}
            value={bandwidthUnit}
            onChange={(v) => setBandwidthUnit((v.value ?? 'gbps') as LinkBandwidthUnit)}
            width={12}
          />
        </div>
      </Field>
      <DraggableModal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            const mbps = parseBandwidthInput(bandwidthValue, bandwidthUnit);
            onSave({
              medium,
              bandwidthMbps: mbps,
            });
            onClose();
          }}
        >
          Salvar
        </Button>
      </DraggableModal.ButtonRow>
    </DraggableModal>
  );
}
