import React, { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, Select } from '@grafana/ui';
import { TopologyHostIcon, TopologyMap } from '../types';
import { hostIconSelectOptions } from '../utils/hostIcons';
import {
  fetchZabbixGroups,
  fetchZabbixGroupsForHost,
  fetchZabbixHostsInGroup,
  ZabbixGroupOption,
  ZabbixHostOption,
} from '../utils/zabbixApi';

interface Props {
  mode: 'add' | 'edit';
  datasourceUid?: string;
  defaultGroup?: string;
  storedMap: TopologyMap;
  /** Host Zabbix atual (modo editar) */
  initialVisibleName?: string;
  /** Ícone atual (modo editar) */
  initialIcon?: TopologyHostIcon;
  onConfirm: (visibleName: string, ip: string | undefined, icon: TopologyHostIcon) => void;
  onClose: () => void;
}

function hostsAlreadyOnMap(map: TopologyMap, except?: string): Set<string> {
  const keys = new Set<string>();
  const skip = except?.trim();
  for (const node of map.nodes) {
    if ((node.type ?? 'host') !== 'host') {
      continue;
    }
    const z = node.zabbixHost?.trim();
    if (z && z !== skip) {
      keys.add(z);
    }
  }
  return keys;
}

export function ZabbixHostPickerModal({
  mode,
  datasourceUid,
  defaultGroup,
  storedMap,
  initialVisibleName,
  initialIcon,
  onConfirm,
  onClose,
}: Props) {
  const [groups, setGroups] = useState<ZabbixGroupOption[]>([]);
  const [hosts, setHosts] = useState<ZabbixHostOption[]>([]);
  const [groupId, setGroupId] = useState<string | undefined>();
  const [hostName, setHostName] = useState<string | undefined>();
  const [icon, setIcon] = useState<TopologyHostIcon>(initialIcon ?? 'host');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onMap = useMemo(
    () => hostsAlreadyOnMap(storedMap, mode === 'edit' ? initialVisibleName : undefined),
    [storedMap, mode, initialVisibleName]
  );

  useEffect(() => {
    if (!datasourceUid) {
      setLoadError('Configure o UID do datasource Zabbix nas opções do painel.');
      return;
    }
    let cancelled = false;
    setLoadingGroups(true);
    setLoadError(null);

    void (async () => {
      const list = await fetchZabbixGroups(datasourceUid);
      if (cancelled) {
        return;
      }
      setGroups(list);
      setLoadingGroups(false);
      if (!list.length) {
        setLoadError('Nenhum grupo encontrado no Zabbix.');
        return;
      }

      let preferredId: string | undefined;
      if (mode === 'edit' && initialVisibleName) {
        const hostGroups = await fetchZabbixGroupsForHost(datasourceUid, initialVisibleName);
        if (hostGroups.length) {
          preferredId = hostGroups[0].groupid;
        }
      }
      if (!preferredId && defaultGroup) {
        preferredId = list.find((g) => g.name === defaultGroup || g.name.endsWith(`/${defaultGroup}`))?.groupid;
      }
      setGroupId(preferredId ?? list[0].groupid);
    })();

    return () => {
      cancelled = true;
    };
  }, [datasourceUid, defaultGroup, mode, initialVisibleName]);

  useEffect(() => {
    if (!datasourceUid || !groupId) {
      setHosts([]);
      setHostName(undefined);
      return;
    }
    let cancelled = false;
    setLoadingHosts(true);
    fetchZabbixHostsInGroup(datasourceUid, groupId).then((list) => {
      if (cancelled) {
        return;
      }
      setHosts(list);
      setLoadingHosts(false);
      if (mode === 'edit' && initialVisibleName) {
        const match = list.find((h) => h.visibleName === initialVisibleName);
        if (match) {
          setHostName(match.visibleName);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [datasourceUid, groupId, mode, initialVisibleName]);

  const groupOptions = groups.map((g) => ({ label: g.name, value: g.groupid }));
  const hostOptions = hosts
    .filter((h) => !onMap.has(h.visibleName))
    .map((h) => ({
      label: h.ip ? `${h.visibleName} (${h.ip})` : h.visibleName,
      value: h.visibleName,
    }));

  const selectedHost = hosts.find((h) => h.visibleName === hostName);
  const canConfirm = Boolean(hostName && selectedHost);
  const title = mode === 'edit' ? 'Editar host Zabbix' : 'Adicionar host Zabbix';
  const confirmLabel = mode === 'edit' ? 'Salvar' : 'Adicionar';

  return (
    <Modal title={title} isOpen onDismiss={onClose}>
      {!datasourceUid ? (
        <p>Configure o datasource Zabbix nas opções do painel.</p>
      ) : (
        <>
          <Field label="Grupo Zabbix">
            <Select
              options={groupOptions}
              value={groupId}
              isLoading={loadingGroups}
              onChange={(v) => {
                setGroupId(v.value);
                setHostName(undefined);
              }}
              placeholder="Selecione o grupo"
            />
          </Field>
          <Field label="Host" description={loadError ?? 'Nome e IP vêm do Zabbix'}>
            <Select
              options={hostOptions}
              value={hostName}
              isLoading={loadingHosts}
              disabled={!groupId || loadingHosts}
              onChange={(v) => setHostName(v.value)}
              placeholder={
                loadingHosts
                  ? 'Carregando hosts…'
                  : hostOptions.length
                    ? 'Selecione o host'
                    : 'Nenhum host disponível neste grupo'
              }
            />
          </Field>
          {selectedHost?.ip ? (
            <Field label="IP">
              <span>{selectedHost.ip}</span>
            </Field>
          ) : null}
          <Field label="Tipo / ícone">
            <Select
              options={hostIconSelectOptions()}
              value={icon}
              onChange={(v) => setIcon((v.value ?? 'host') as TopologyHostIcon)}
            />
          </Field>
        </>
      )}
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!canConfirm}
          onClick={() => {
            if (selectedHost) {
              onConfirm(selectedHost.visibleName, selectedHost.ip, icon);
              onClose();
            }
          }}
        >
          {confirmLabel}
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
}

/** @deprecated use ZabbixHostPickerModal */
export const AddZabbixHostModal = ZabbixHostPickerModal;
