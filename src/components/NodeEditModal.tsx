import React, { useEffect, useId, useMemo, useState } from 'react';
import { Button, Field, Input, Modal } from '@grafana/ui';
import { NodeEditSavePayload, TopologyMap, TopologyNode, TopologyQueryRefInfo } from '../types';
import { HostIconPicker } from './HostIconPicker';
import { FieldReadout } from './FieldReadout';
import { DashboardPickerFields } from './nodeEdit/DashboardPickerFields';
import { HostToolsFields } from './nodeEdit/HostToolsFields';
import { NetworkFields } from './nodeEdit/NetworkFields';
import { StaticFields } from './nodeEdit/StaticFields';
import { SubmapFields } from './nodeEdit/SubmapFields';
import { ZabbixHostFields } from './nodeEdit/ZabbixHostFields';
import { useNodeEditForm } from '../hooks/useNodeEditForm';
import { HOST_ICON_LABELS } from '../utils/hostIcons';
import { resolveHostIp } from '../utils/hostLookup';
import { isIpv4 } from '../utils/ipv4';
import { buildNodeEditPayload } from '../utils/nodeEditPayload';
import { hostsAlreadyOnMap, QueryHostOption, queryHostPickerOptions, resolveQueryHostOptionForNode } from '../utils/queryHostPicker';

interface Props {
  node: TopologyNode;
  queryRefInfos?: TopologyQueryRefInfo[];
  queryHostOptions?: QueryHostOption[];
  storedMap?: TopologyMap;
  onSave: (payload: NodeEditSavePayload) => void;
  onClose: () => void;
}

const TITLES: Record<string, string> = {
  submap: 'Propriedades do submapa',
  dashboard_picker: 'Propriedades do seletor',
  static: 'Propriedades do estático',
  network: 'Propriedades da rede',
  host: 'Propriedades do host',
};

function hostSelectValue(node: TopologyNode): string | undefined {
  const ip = resolveHostIp(node);
  if (ip) {
    return ip;
  }
  return node.zabbixHost?.trim() || node.label?.trim() || undefined;
}

export function NodeEditModal({
  node,
  queryRefInfos = [],
  queryHostOptions = [],
  storedMap,
  onSave,
  onClose,
}: Props) {
  const uid = useId();
  const { values, set } = useNodeEditForm(node);
  const [selectedHostKey, setSelectedHostKey] = useState<string | undefined>(hostSelectValue(node));

  const type = node.type ?? 'host';
  const isHost = type === 'host';
  const isZabbixHost = isHost && Boolean(node.zabbixHost?.trim());
  const nodeIp = resolveHostIp(node);

  const onMap = useMemo(() => {
    if (!storedMap) {
      return { ips: new Set<string>(), names: new Set<string>() };
    }
    return hostsAlreadyOnMap(storedMap, nodeIp, node.zabbixHost);
  }, [node.zabbixHost, nodeIp, storedMap]);

  const boundQueryHost = useMemo(
    () => resolveQueryHostOptionForNode(queryHostOptions, node),
    [node, queryHostOptions]
  );

  useEffect(() => {
    if (!isZabbixHost) {
      return;
    }
    const match = resolveQueryHostOptionForNode(queryHostOptions, node);
    if (match) {
      setSelectedHostKey(match.ip ?? match.visibleName);
    }
  }, [isZabbixHost, node, queryHostOptions]);

  const queryHostSelectOptions = useMemo(
    () => queryHostPickerOptions(queryHostOptions, onMap, boundQueryHost),
    [boundQueryHost, onMap, queryHostOptions]
  );

  const selectedQueryHost =
    queryHostOptions.find((host) => host.ip === selectedHostKey || host.visibleName === selectedHostKey) ??
    boundQueryHost;

  const handleSave = () => {
    const payload = buildNodeEditPayload(node, values, selectedQueryHost, nodeIp);
    if (!payload) {
      return;
    }
    onSave(payload);
    onClose();
  };

  const hostSelectionChanged = selectedHostKey !== hostSelectValue(node);
  const saveDisabled =
    isZabbixHost &&
    hostSelectionChanged &&
    (!selectedQueryHost?.ip || !isIpv4(selectedQueryHost.ip)) &&
    !nodeIp;

  return (
    <Modal title={TITLES[type] ?? TITLES.host} isOpen onDismiss={onClose}>
      {isZabbixHost && (
        <ZabbixHostFields
          uid={uid}
          options={queryHostSelectOptions}
          hasQueryHosts={queryHostOptions.length > 0}
          selectedHostKey={selectedHostKey}
          displayIp={selectedQueryHost?.ip ?? nodeIp}
          onSelect={setSelectedHostKey}
        />
      )}
      {!isZabbixHost && type !== 'dashboard_picker' && (
        <Field label="Nome exibido">
          <Input
            id={`${uid}-label`}
            value={values.label}
            onChange={(e) => set('label', e.currentTarget.value)}
          />
        </Field>
      )}
      {!isZabbixHost && isHost && (
        <Field label="Subtítulo / IP">
          <Input
            id={`${uid}-subtitle`}
            value={values.subtitle}
            onChange={(e) => set('subtitle', e.currentTarget.value)}
          />
        </Field>
      )}
      {isHost && (
        <FieldReadout label="Tipo / ícone" description={`Ícone: ${HOST_ICON_LABELS[values.icon]}`}>
          <HostIconPicker value={values.icon} onChange={(icon) => set('icon', icon)} />
        </FieldReadout>
      )}
      {isHost && <HostToolsFields uid={uid} values={values} set={set} />}
      {type === 'submap' && (
        <SubmapFields uid={uid} values={values} set={set} queryRefInfos={queryRefInfos} />
      )}
      {type === 'dashboard_picker' && <DashboardPickerFields uid={uid} values={values} set={set} />}
      {type === 'static' && <StaticFields uid={uid} values={values} set={set} />}
      {type === 'network' && <NetworkFields uid={uid} node={node} values={values} set={set} />}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={saveDisabled} onClick={handleSave}>
          Salvar
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}
