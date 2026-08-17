import React from 'react';
import { PanelData } from '@grafana/data';
import { BulkEditModalsState } from '../../hooks/useBulkEditModals';
import { HostHoverTarget } from '../../hooks/useHostHoverTarget';
import { NodePropertiesModalsState } from '../../hooks/useNodePropertiesModals';
import {
  HostDisplayMap,
  HostMetadataMap,
  NodeEditSavePayload,
  TopologyInterfaceReference,
  TopologyMap,
  TopologyPanelOptions,
} from '../../types';
import { addZabbixHostAt } from '../../utils/mapEdits';
import { updateLinkProps } from '../../utils/mapLinkEdits';
import { applyNodeEditSave } from '../../utils/nodeEditSave';
import { QueryHostOption } from '../../utils/queryHostPicker';
import { DashboardPickerModal, openDashboardUrl } from '../DashboardPickerModal';
import { HostHoverPopover } from '../HostHoverPopover';
import {
  LinkEditModal,
  LinkInterfaceSelectModal,
  NodeEditModal,
  PingModal,
  ZabbixHostPickerModal,
} from '../lazyModals';
import { BulkEditModals } from './BulkEditModals';
import { PendingLinkEndpoints } from '../LinkInterfaceSelectModal';

export interface PingTarget {
  label: string;
  ip: string;
  zabbixHost?: string;
}

interface CanvasModalsProps {
  storedMap: TopologyMap;
  options: TopologyPanelOptions;
  persist: (map: TopologyMap) => void;
  showToast: (message: string) => void;
  modals: NodePropertiesModalsState;
  bulk: BulkEditModalsState;
  queryHostOptions: QueryHostOption[];
  zabbixMetadataLoading: boolean;
  zabbixDatasourceUid?: string;
  queryData?: PanelData;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  queryReady?: boolean;
  pingTarget: PingTarget | null;
  setPingTarget: (target: PingTarget | null) => void;
  hostHover: HostHoverTarget | null;
  searchOpen: boolean;
  pendingLink: PendingLinkEndpoints | null;
  onPendingLinkClose: () => void;
  onPendingLinkSave: (
    fromInterface: TopologyInterfaceReference | undefined,
    toInterface: TopologyInterfaceReference | undefined,
    bandwidthMbps?: number
  ) => void;
}

/**
 * Todo o conteúdo em camada sobreposta do canvas: modais de propriedades, seleção de host e
 * dashboard, edição em massa, ping e o popover de hover. Ficam juntos porque compartilham
 * `storedMap`/`persist` e nenhum deles participa do desenho do mapa.
 */
export function CanvasModals({
  storedMap,
  options,
  persist,
  showToast,
  modals,
  bulk,
  queryHostOptions,
  zabbixMetadataLoading,
  zabbixDatasourceUid,
  queryData,
  hostMetadata,
  hostDisplay,
  queryReady,
  pingTarget,
  setPingTarget,
  hostHover,
  searchOpen,
  pendingLink,
  onPendingLinkClose,
  onPendingLinkSave,
}: CanvasModalsProps) {
  const { editNode, setEditNode, pickerNode, setPickerNode, editLink, setEditLink, addHostAt, setAddHostAt } =
    modals;

  return (
    <>
      {editNode && (
        <NodeEditModal
          node={editNode}
          queryRefInfos={options.queryRefInfosAvailable ?? []}
          queryHostOptions={queryHostOptions}
          storedMap={storedMap}
          childMapIds={Object.keys(options.childMaps ?? {}).sort()}
          onClose={() => setEditNode(null)}
          onSave={(payload: NodeEditSavePayload) =>
            persist(applyNodeEditSave(storedMap, editNode, payload))
          }
        />
      )}

      {pickerNode && (
        <DashboardPickerModal
          node={pickerNode}
          onClose={() => setPickerNode(null)}
          onSelect={(choice) => {
            setPickerNode(null);
            openDashboardUrl(choice.uid, choice.slug);
          }}
        />
      )}

      {addHostAt && (
        <ZabbixHostPickerModal
          mode="add"
          queryHostOptions={queryHostOptions}
          storedMap={storedMap}
          zabbixMetadataLoading={zabbixMetadataLoading}
          onClose={() => setAddHostAt(null)}
          onConfirm={(visibleName, ip, icon) =>
            persist(addZabbixHostAt(storedMap, addHostAt.mapX, addHostAt.mapY, visibleName, ip, icon))
          }
        />
      )}

      <BulkEditModals storedMap={storedMap} state={bulk} persist={persist} showToast={showToast} />

      {pingTarget && (
        <PingModal
          label={pingTarget.label}
          ip={pingTarget.ip}
          zabbixHost={pingTarget.zabbixHost}
          datasourceUid={zabbixDatasourceUid}
          onClose={() => setPingTarget(null)}
        />
      )}

      {hostHover && !editNode && !searchOpen ? (
        <HostHoverPopover
          node={hostHover.node}
          screenX={hostHover.screenX}
          screenY={hostHover.screenY}
          queryData={queryData}
          hostMetadata={hostMetadata}
          hostDisplay={hostDisplay}
          options={options}
          queryReady={queryReady}
        />
      ) : null}

      {editLink && (
        <LinkEditModal
          link={editLink}
          storedMap={storedMap}
          datasourceUid={zabbixDatasourceUid}
          hostMetadata={hostMetadata}
          onClose={() => setEditLink(null)}
          onSave={(patch) => persist(updateLinkProps(storedMap, editLink.from, editLink.to, patch))}
        />
      )}

      {pendingLink && (
        <LinkInterfaceSelectModal
          pending={pendingLink}
          hostMetadata={hostMetadata}
          datasourceUid={zabbixDatasourceUid}
          onClose={onPendingLinkClose}
          onSave={onPendingLinkSave}
        />
      )}
    </>
  );
}
