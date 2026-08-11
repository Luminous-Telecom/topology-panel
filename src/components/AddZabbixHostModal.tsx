import React, { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, Select } from '@grafana/ui';
import { TopologyHostIcon, TopologyMap } from '../types';
import { HostIconPicker } from './HostIconPicker';
import { hostsAlreadyOnMap, isIpv4, QueryHostOption, queryHostPickerOptions } from '../utils';

const ipReadoutStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
};

interface Props {
  mode: 'add' | 'edit';
  queryHostOptions?: QueryHostOption[];
  storedMap: TopologyMap;
  /** Host Zabbix atual (modo editar) */
  initialVisibleName?: string;
  /** IP Zabbix atual (modo editar) */
  initialIp?: string;
  /** Ícone atual (modo editar) */
  initialIcon?: TopologyHostIcon;
  onConfirm: (visibleName: string, ip: string, icon: TopologyHostIcon) => void;
  onClose: () => void;
}

export function ZabbixHostPickerModal({
  mode,
  queryHostOptions = [],
  storedMap,
  initialVisibleName,
  initialIp,
  initialIcon,
  onConfirm,
  onClose,
}: Props) {
  const [hostKey, setHostKey] = useState<string | undefined>();
  const [icon, setIcon] = useState<TopologyHostIcon>(initialIcon ?? 'network');

  const onMap = useMemo(
    () =>
      hostsAlreadyOnMap(
        storedMap,
        mode === 'edit' ? initialIp : undefined,
        mode === 'edit' ? initialVisibleName : undefined
      ),
    [storedMap, mode, initialVisibleName, initialIp]
  );

  useEffect(() => {
    if (mode !== 'edit') {
      return;
    }
    const ip = initialIp?.trim();
    const match =
      (ip && isIpv4(ip) && queryHostOptions.find((host) => host.ip === ip)) ||
      (initialVisibleName &&
        queryHostOptions.find((host) => host.visibleName === initialVisibleName));
    if (match) {
      setHostKey(match.ip ?? match.visibleName);
    }
  }, [mode, initialVisibleName, initialIp, queryHostOptions]);

  const hostOptions = queryHostPickerOptions(queryHostOptions, onMap);

  const selectedHost = queryHostOptions.find(
    (host) => host.ip === hostKey || host.visibleName === hostKey
  );
  const resolvedIp =
    selectedHost?.ip?.trim() ||
    (hostKey && isIpv4(hostKey) ? hostKey.trim() : undefined);
  const canConfirm = Boolean(resolvedIp && isIpv4(resolvedIp));
  const title = mode === 'edit' ? 'Editar host Zabbix' : 'Adicionar host Zabbix';
  const confirmLabel = mode === 'edit' ? 'Salvar' : 'Adicionar';
  const loadError = queryHostOptions.length
    ? null
    : 'Nenhum host na Query do painel. Configure a aba Query e aguarde os dados.';

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      <Field
        label="Host"
        description={
          loadError ??
          'Hosts retornados pela Query do painel. Vinculado pelo IP nos labels da série.'
        }
      >
        <Select
          options={hostOptions}
          value={hostKey}
          disabled={!queryHostOptions.length}
          onChange={(v) => setHostKey(v.value)}
          placeholder={
            hostOptions.length ? 'Selecione o host' : 'Nenhum host disponível na Query'
          }
        />
      </Field>
      {resolvedIp ? (
        <Field label="IP">
          <div style={ipReadoutStyle}>{resolvedIp}</div>
        </Field>
      ) : null}
      <Field label="Tipo / ícone">
        <HostIconPicker value={icon} onChange={setIcon} />
      </Field>
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!canConfirm}
          onClick={() => {
            const ip = resolvedIp?.trim();
            if (!ip || !isIpv4(ip)) {
              return;
            }
            const visibleName = selectedHost?.visibleName ?? ip;
            onConfirm(visibleName, ip, icon);
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
