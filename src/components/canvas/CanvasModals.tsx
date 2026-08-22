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
import { resolvePanelQueryRefInfos } from '../../services/zabbixDirectIndex';
import { addZabbixHostAt } from '../../utils/mapEdits';
import { activeChildMaps } from '../../utils/childMapEdits';
import { updateLinkProps } from '../../utils/mapLinkEdits';
import { BulkSubmapLayoutSize } from '../../utils/mapBulkEdits';
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
  nodeLayouts?: Map<string, BulkSubmapLayoutSize>;
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
  contextMenuOpen?: boolean;
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
  nodeLayouts,
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
  contextMenuOpen = false,
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
          key={`${editNode.id}:${editNode.width ?? ''}:${editNode.height ?? ''}`}
          node={editNode}
          queryRefInfos={resolvePanelQueryRefInfos(options)}
          queryHostOptions={queryHostOptions}
          storedMap={storedMap}
          childMapIds={Object.keys(activeChildMaps(options.childMaps)).sort()}
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

      <BulkEditModals
        storedMap={storedMap}
        nodeLayouts={nodeLayouts}
        state={bulk}
        persist={persist}
        showToast={showToast}
      />

      {pingTarget && (
        <PingModal
          label={pingTarget.label}
          ip={pingTarget.ip}
          zabbixHost={pingTarget.zabbixHost}
          datasourceUid={zabbixDatasourceUid}
          onClose={() => setPingTarget(null)}
        />
      )}

      {hostHover && !editNode && !searchOpen && !contextMenuOpen ? (
        <HostHoverPopover
          node={hostHover.node}
          screenX={hostHover.screenX}
          screenY={hostHover.screenY}
          queryData={queryData}
          hostMetadata={hostMetadata}
          hostDisplay={hostDisplay}
          options={options}
          queryReady={queryReady}
          zabbixDatasourceUid={zabbixDatasourceUid}
        />
      ) : null}

      {editLink && (
        <LinkEditModal
          link={editLink}
          storedMap={storedMap}
          hostMetadata={hostMetadata}
          zabbixDatasourceUid={zabbixDatasourceUid}
          zabbixRxItemKeyword={options.zabbixRxItemKeyword}
          zabbixTxItemKeyword={options.zabbixTxItemKeyword}
          zabbixOperStatusItemKeyword={options.zabbixOperStatusItemKeyword}
          zabbixSpeedItemKeyword={options.zabbixSpeedItemKeyword}
          onClose={() => setEditLink(null)}
          onSave={(patch) => persist(updateLinkProps(storedMap, editLink.from, editLink.to, patch))}
        />
      )}

      {pendingLink && (
        <LinkInterfaceSelectModal
          pending={pendingLink}
          hostMetadata={hostMetadata}
          zabbixDatasourceUid={zabbixDatasourceUid}
          zabbixRxItemKeyword={options.zabbixRxItemKeyword}
          zabbixTxItemKeyword={options.zabbixTxItemKeyword}
          zabbixOperStatusItemKeyword={options.zabbixOperStatusItemKeyword}
          zabbixSpeedItemKeyword={options.zabbixSpeedItemKeyword}
          onClose={onPendingLinkClose}
          onSave={onPendingLinkSave}
        />
      )}
    </>
  );
}
