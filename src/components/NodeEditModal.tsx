import React, { useState } from 'react';
import { Button, Field, Input, Modal } from '@grafana/ui';
import { TopologyHostIcon, TopologyNode } from '../types';
import { DashboardPickerSelect } from './DashboardPickerSelect';
import { HostIconPicker } from './HostIconPicker';
import { HOST_ICON_LABELS } from '../utils/hostIcons';

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
  const [icon, setIcon] = useState<TopologyHostIcon>(node.icon ?? 'network');
  const [width, setWidth] = useState(node.width !== undefined ? String(node.width) : '');
  const [height, setHeight] = useState(node.height !== undefined ? String(node.height) : '');
  const [fontSize, setFontSize] = useState(node.fontSize !== undefined ? String(node.fontSize) : '');
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
          <HostIconPicker value={icon} onChange={setIcon} />
        </Field>
      )}
      {type === 'submap' && (
        <Field
          label="Dashboard"
          description={submapSlug ? `Slug: ${submapSlug}` : 'Selecione o dashboard de destino do submapa'}
        >
          <DashboardPickerSelect
            value={submapUid}
            onChange={(uid, slug) => {
              setSubmapUid(uid);
              if (slug) {
                setSubmapSlug(slug);
              }
            }}
          />
        </Field>
      )}
      {type === 'static' && (
        <>
          <Field label="Largura (px)" description="Vazio = automático pelo texto">
            <Input type="number" value={width} onChange={(e) => setWidth(e.currentTarget.value)} placeholder="Automático" />
          </Field>
          <Field label="Altura (px)" description="Vazio = automático pelo texto">
            <Input type="number" value={height} onChange={(e) => setHeight(e.currentTarget.value)} placeholder="Automático" />
          </Field>
          <Field label="Tamanho da fonte (px)" description="Vazio = padrão do painel">
            <Input type="number" value={fontSize} onChange={(e) => setFontSize(e.currentTarget.value)} placeholder="Padrão do painel" />
          </Field>
        </>
      )}
      {type === 'network' && (
        <>
          <Field label="Largura (px)">
            <Input type="number" value={width || String(node.width ?? 220)} onChange={(e) => setWidth(e.currentTarget.value)} />
          </Field>
          <Field label="Altura (px)">
            <Input type="number" value={height || String(node.height ?? 140)} onChange={(e) => setHeight(e.currentTarget.value)} />
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
            if (type === 'static') {
              patch.width = width.trim() ? Math.max(24, Number(width) || 24) : undefined;
              patch.height = height.trim() ? Math.max(20, Number(height) || 20) : undefined;
              patch.fontSize = fontSize.trim() ? Math.max(8, Number(fontSize) || 8) : undefined;
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
