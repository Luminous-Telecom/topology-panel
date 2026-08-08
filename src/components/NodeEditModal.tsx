import React, { useState } from 'react';
import { Button, Field, Input, Modal } from '@grafana/ui';
import { TopologyNode } from '../types';

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
  const [zabbixHost, setZabbixHost] = useState(node.zabbixHost ?? '');
  const [width, setWidth] = useState(String(node.width ?? 220));
  const [height, setHeight] = useState(String(node.height ?? 140));
  const [fillColor, setFillColor] = useState(node.fillColor ?? '');
  const [borderColor, setBorderColor] = useState(node.borderColor ?? '');

  const type = node.type ?? 'host';
  const isZabbixHost = type === 'host' && Boolean(node.zabbixHost?.trim());
  const title =
    type === 'submap'
      ? 'Submapa'
      : type === 'static'
        ? 'Estático'
        : type === 'network'
          ? 'Rede'
          : isZabbixHost
            ? 'Host Zabbix'
            : 'Dispositivo';

  if (isZabbixHost) {
    return (
      <Modal title={title} isOpen onDismiss={onClose}>
        <Field label="Nome (Zabbix)">
          <Input value={node.zabbixHost ?? ''} disabled />
        </Field>
        {node.subtitle ? (
          <Field label="IP (Zabbix)">
            <Input value={node.subtitle} disabled />
          </Field>
        ) : null}
        <Modal.ButtonRow>
          <Button onClick={onClose}>Fechar</Button>
        </Modal.ButtonRow>
      </Modal>
    );
  }

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      <Field label="Nome exibido">
        <Input value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
      </Field>
      <Field label="Subtítulo / IP">
        <Input value={subtitle} onChange={(e) => setSubtitle(e.currentTarget.value)} />
      </Field>
      {type === 'host' && !node.zabbixHost && (
        <Field label="Host Zabbix (opcional)">
          <Input value={zabbixHost} onChange={(e) => setZabbixHost(e.currentTarget.value)} />
        </Field>
      )}
      {type === 'host' && node.zabbixHost && (
        <Field label="Host Zabbix">
          <Input value={node.zabbixHost} disabled />
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
              label,
              subtitle,
              submapUid: type === 'submap' ? submapUid : undefined,
              submapSlug: type === 'submap' ? submapSlug : undefined,
              zabbixHost: type === 'host' && !node.zabbixHost ? zabbixHost : node.zabbixHost,
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
