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
  TopologyLink,
  TopologyLinkPeerHost,
  TopologyMap,
  TopologyPanelOptions,
} from '../../types';
import { addZabbixHostAt } from '../../utils/mapEdits';
import { activeChildMaps } from '../../utils/childMapEdits';
import { linksMatchIdentity, updateLinkProps } from '../../utils/mapLinkEdits';
import { BulkSubmapLayoutSize } from '../../utils/mapBulkEdits';
import { applyNodeEditSave } from '../../utils/nodeEditSave';
import { QueryHostOption } from '../../utils/queryHostPicker';
import { HostHoverSeriesMap } from '../../utils/hostTimeSeries';
import { HostProblemsMap } from '../../utils/noc/types';
import { DashboardPickerModal, openDashboardUrl } from '../DashboardPickerModal';
import { HostHoverPopover } from '../HostHoverPopover';
import {
  HostInfoModal,
  LinkEditModal,
  LinkInterfaceSelectModal,
  NodeEditModal,
  PingModal,
  ZabbixHostPickerModal,
} from '../lazyModals';
import { BulkEditModals } from './BulkEditModals';
import { PendingLinkEndpoints } from '../LinkInterfaceSelectModal';
import { panelInterfaceKeywords } from '../../hooks/useZabbixHostInterfaces';

export interface PingTarget {
  label: string;
  ip: string;
  zabbixHost?: string;
}

interface CanvasModalsProps {
  storedMap: TopologyMap;
  nodeLayouts?: Map<string, BulkSubmapLayoutSize>;
  options: TopologyPanelOptions;
  persist: (map: TopologyMap, context?: { interSubmapLink?: TopologyLink }) => void;
  showToast: (message: string) => void;
  modals: NodePropertiesModalsState;
  bulk: BulkEditModalsState;
  queryHostOptions: QueryHostOption[];
  zabbixDatasourceUid?: string;
  queryData?: PanelData;
  hoverByHost?: HostHoverSeriesMap;
  hostMetadata?: HostMetadataMap;
  hostDisplay?: HostDisplayMap;
  hostProblems?: HostProblemsMap;
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
    bandwidthMbps?: number,
    fromPeerHost?: TopologyLinkPeerHost,
    toPeerHost?: TopologyLinkPeerHost
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
  zabbixDatasourceUid,
  queryData,
  hoverByHost,
  hostMetadata,
  hostDisplay,
  hostProblems,
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
  const {
    editNode,
    setEditNode,
    viewHost,
    setViewHost,
    pickerNode,
    setPickerNode,
    editLink,
    setEditLink,
    addHostAt,
    setAddHostAt,
  } = modals;

  return (
    <>
      {editNode && (
        <NodeEditModal
          key={`${editNode.id}:${editNode.width ?? ''}:${editNode.height ?? ''}`}
          node={editNode}
          datasourceUid={options.zabbixDatasourceUid}
          queryHostOptions={queryHostOptions}
          storedMap={storedMap}
          childMapIds={Object.keys(activeChildMaps(options.childMaps)).sort()}
          onClose={() => setEditNode(null)}
          onSave={(payload: NodeEditSavePayload) =>
            persist(applyNodeEditSave(storedMap, editNode, payload))
          }
        />
      )}

      {viewHost && (
        <HostInfoModal
          node={viewHost}
          hostMetadata={hostMetadata}
          onClose={() => setViewHost(null)}
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

      {hostHover && !editNode && !viewHost && !searchOpen && !contextMenuOpen ? (
        <HostHoverPopover
          node={hostHover.node}
          screenX={hostHover.screenX}
          screenY={hostHover.screenY}
          queryData={queryData}
          hoverByHost={hoverByHost}
          hostMetadata={hostMetadata}
          hostDisplay={hostDisplay}
          hostProblems={hostProblems}
          options={options}
          queryReady={queryReady}
        />
      ) : null}

      {editLink && (
        <LinkEditModal
          link={editLink}
          storedMap={storedMap}
          childMaps={activeChildMaps(options.childMaps)}
          hostMetadata={hostMetadata}
          zabbixDatasourceUid={zabbixDatasourceUid}
          interfaceKeywords={panelInterfaceKeywords(options)}
          onClose={() => setEditLink(null)}
          onSave={(patch) => {
            const next = updateLinkProps(storedMap, editLink, patch);
            const updated = next.links.find((link) =>
              linksMatchIdentity(link, { ...editLink, ...patch })
            );
            persist(next, updated ? { interSubmapLink: updated } : undefined);
          }}
        />
      )}

      {pendingLink && (
        <LinkInterfaceSelectModal
          pending={pendingLink}
          childMaps={activeChildMaps(options.childMaps)}
          hostMetadata={hostMetadata}
          zabbixDatasourceUid={zabbixDatasourceUid}
          interfaceKeywords={panelInterfaceKeywords(options)}
          onClose={onPendingLinkClose}
          onSave={onPendingLinkSave}
        />
      )}
    </>
  );
}
