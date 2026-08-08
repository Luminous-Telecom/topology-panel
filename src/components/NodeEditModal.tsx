import React, { useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@grafana/ui';
import { TopologyHostIcon, TopologyNode } from '../types';
import { HOST_ICON_LABELS, hostIconSelectOptions } from '../utils/hostIcons';

interface Props {
  node: TopologyNode;
  onSave: (patch: Partial<TopologyNode>) => void;
  onClose: () => void;
}

export function NodeEditModal({ node, onSave, onClose }: Props) {
  const [label, setLabel] = useState(node.label ?? '');
  const [subtitle, setSubtitle] = useState(node.subtitle ?? '');
  const [submapUid, setSubmapUid] = useState(node.submapUid ?? '');
  const [submapSlug, setSubmapSlug] = useState(node.submapSlug ?? '');
  const [icon, setIcon] = useState<TopologyHostIcon>(node.icon ?? 'host');
  const [width, setWidth] = useState(String(node.width ?? 220));
  const [height, setHeight] = useState(String(node.height ?? 140));
  const [fillColor, setFillColor] = useState(node.fillColor ?? '');
  const [borderColor, setBorderColor] = useState(node.borderColor ?? '');

  const type = node.type ?? 'host';
  const isHost = type === 'host';
  const title =
    type === 'submap'
      ? 'Submapa'
      : type === 'static'
        ? 'Estático'
        : type === 'network'
          ? 'Rede'
          : node.zabbixHost
            ? 'Host Zabbix'
            : 'Dispositivo';

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      {node.zabbixHost && (
        <Field label="Host Zabbix">
          <Input value={node.zabbixHost} disabled />
        </Field>
      )}
      {!node.zabbixHost && (
        <Field label="Nome exibido">
          <Input value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        </Field>
      )}
      {!node.zabbixHost && (
        <Field label="Subtítulo / IP">
          <Input value={subtitle} onChange={(e) => setSubtitle(e.currentTarget.value)} />
        </Field>
      )}
      {isHost && (
        <Field label="Tipo / ícone" description={`Ícone: ${HOST_ICON_LABELS[icon]}`}>
          <Select
            options={hostIconSelectOptions()}
            value={icon}
            onChange={(v) => setIcon((v.value ?? 'host') as TopologyHostIcon)}
          />
        </Field>
      )}
      {type === 'submap' && (
        <>
          <Field label="Dashboard UID">
            <Input value={submapUid} onChange={(e) => setSubmapUid(e.currentTarget.value)} />
          </Field>
          <Field label="Slug (opcional)">
            <Input value={submapSlug} onChange={(e) => setSubmapSlug(e.currentTarget.value)} />
          </Field>
        </>
      )}
      {type === 'network' && (
        <>
          <Field label="Largura (px)">
            <Input type="number" value={width} onChange={(e) => setWidth(e.currentTarget.value)} />
          </Field>
          <Field label="Altura (px)">
            <Input type="number" value={height} onChange={(e) => setHeight(e.currentTarget.value)} />
          </Field>
          <Field label="Cor de preenchimento (opcional)" description="Ex: rgba(96,96,96,0.22)">
            <Input value={fillColor} onChange={(e) => setFillColor(e.currentTarget.value)} placeholder="Padrão do painel" />
          </Field>
          <Field label="Cor da borda (opcional)">
            <Input value={borderColor} onChange={(e) => setBorderColor(e.currentTarget.value)} placeholder="Padrão do painel" />
          </Field>
        </>
      )}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            const patch: Partial<TopologyNode> = {
              label: node.zabbixHost ? node.label : label,
              subtitle: node.zabbixHost ? node.subtitle : subtitle,
              submapUid: type === 'submap' ? submapUid : undefined,
              submapSlug: type === 'submap' ? submapSlug : undefined,
              zabbixHost: node.zabbixHost,
              icon: isHost ? icon : undefined,
            };
            if (type === 'network') {
              patch.width = Math.max(60, Number(width) || 220);
              patch.height = Math.max(40, Number(height) || 140);
              patch.fillColor = fillColor.trim() || undefined;
              patch.borderColor = borderColor.trim() || undefined;
            }
            onSave(patch);
            onClose();
          }}
        >
          Salvar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
