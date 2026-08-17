import { useCallback } from 'react';
import {
  HostMetadataMap,
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyPanelOptions,
} from '../types';
import { ContextMenuItem } from '../components/TopologyContextMenu';
import { resolveHostIp } from '../utils/hostLookup';
import { HOST_TOOLS, resolveToolAuth, runHostTool } from '../utils/hostTools';
import { resolveLinkMedium } from '../utils/linkMedium';
import {
  addDashboardPickerAt,
  addManualDeviceAt,
  addNetworkAt,
  addStaticAt,
  addSubmapAt,
  removeLinkByEndpoints,
  updateLinkProps,
} from '../utils/mapEdits';
import { hasTopologyClipboard } from '../utils/topologyClipboard';
import { isHostNode, isSubmapNode } from '../utils/topologyNodes';

/** Alvo do modal de ping — host resolvido para IP. */
export interface PingTarget {
  label: string;
  ip: string;
  zabbixHost?: string;
}

export interface TopologyMenuItemsParams {
  storedMap: TopologyMap;
  /** Mapa destravado e dashboard em modo edição. */
  editable: boolean;
  options: TopologyPanelOptions;
  hostMetadata?: HostMetadataMap;
  /** Ponto do mapa onde o menu abriu — âncora de "Colar aqui" e dos "Adicionar". */
  anchor: { mapX: number; mapY: number } | null;
  selectedNodeIds: string[];
  selectedNodes: TopologyNode[];
  selectedHostNodes: TopologyNode[];
  selectedSubmapNodes: TopologyNode[];
  selectedLink: TopologyLink | null;
  snapCoord: (value: number) => number;
  persist: (map: TopologyMap) => void;
  closeMenu: () => void;
  copySelection: () => void;
  pasteAt: (mapX: number, mapY: number) => void;
  deleteSelectedNodes: () => void;
  removeNodes: (nodes: TopologyNode[]) => void;
  openBulkIconEdit: () => void;
  openBulkCredsEdit: () => void;
  openBulkSubmapEdit: () => void;
  openNodeProperties: (node: TopologyNode) => void;
  openAddHost: (at: { mapX: number; mapY: number }) => void;
  openLinkEdit: (link: TopologyLink) => void;
  resetLinkRoute: (link: TopologyLink) => void;
  beginLinkFrom: (nodeId: string) => void;
  /** Entra no modo link sem origem definida — o próximo clique escolhe o nó inicial. */
  beginLinkFromCanvas: () => void;
  setPingTarget: (target: PingTarget) => void;
  /** Aceita `undefined` porque `runHostTool` pode resolver sem mensagem. */
  showToast: (message: string | undefined) => void;
}

function deleteNodesMenuLabel(count: number): string {
  return count > 1 ? `Excluir seleção (${count})` : 'Excluir seleção';
}

function copySelectionMenuLabel(count: number): string {
  return count > 1 ? `Copiar seleção (${count})` : 'Copiar seleção';
}

function deleteNodeMenuLabel(node: TopologyNode): string {
  switch (node.type) {
    case 'submap':
      return 'Excluir submapa';
    case 'dashboard_picker':
      return 'Excluir seletor';
    case 'static':
      return 'Excluir estático';
    case 'network':
      return 'Excluir rede';
    default:
      return 'Excluir host';
  }
}

/**
 * Monta os itens dos três menus de contexto (canvas vazio, nó e link).
 *
 * Fica fora do `TopologyCanvas` porque é lógica de decisão pura sobre a seleção atual: o canvas só
 * precisa saber qual builder chamar quando o menu abre.
 */
export function useTopologyMenuItems({
  storedMap,
  editable,
  options,
  hostMetadata,
  anchor,
  selectedNodeIds,
  selectedNodes,
  selectedHostNodes,
  selectedSubmapNodes,
  selectedLink,
  snapCoord,
  persist,
  closeMenu,
  copySelection,
  pasteAt,
  deleteSelectedNodes,
  removeNodes,
  openBulkIconEdit,
  openBulkCredsEdit,
  openBulkSubmapEdit,
  openNodeProperties,
  openAddHost,
  openLinkEdit,
  resetLinkRoute,
  beginLinkFrom,
  beginLinkFromCanvas,
  setPingTarget,
  showToast,
}: TopologyMenuItemsParams) {
  /** Submenu "Tools" — só existe quando o host tem IP resolvido. */
  const buildToolsMenu = useCallback(
    (node: TopologyNode): ContextMenuItem | null => {
      const ip = resolveHostIp(node, hostMetadata);
      if (!ip) {
        return null;
      }
      return {
        id: 'tools',
        label: 'Tools',
        variant: 'submenu',
        children: HOST_TOOLS.map((tool) => ({
          id: `tool-${tool.id}`,
          label: tool.label,
          variant: 'tool' as const,
          onClick: () => {
            if (tool.id === 'ping') {
              setPingTarget({
                label: node.label?.trim() ?? '',
                ip,
                zabbixHost: node.zabbixHost,
              });
              return;
            }
            void runHostTool(tool.id, ip, resolveToolAuth(node, options)).then(showToast);
          },
        })),
      };
    },
    [hostMetadata, options, setPingTarget, showToast]
  );

  const canvasMenuItems = useCallback((): ContextMenuItem[] => {
    const { mapX, mapY } = anchor ?? { mapX: 0, mapY: 0 };
    const items: ContextMenuItem[] = [];

    if (selectedNodeIds.length > 0 || selectedLink) {
      items.push({
        id: 'copy-selection',
        label: copySelectionMenuLabel(selectedNodeIds.length),
        onClick: () => {
          closeMenu();
          copySelection();
        },
      });
    }

    if (hasTopologyClipboard()) {
      items.push({
        id: 'paste-here',
        label: 'Colar aqui',
        onClick: () => pasteAt(snapCoord(mapX), snapCoord(mapY)),
      });
    }

    if (selectedHostNodes.length >= 1) {
      items.push({
        id: 'bulk-icon',
        label: `Alterar tipo / ícone (${selectedHostNodes.length} hosts)`,
        onClick: openBulkIconEdit,
      });
      items.push({
        id: 'bulk-creds',
        label: `Usuário / senha Tools (${selectedHostNodes.length} hosts)`,
        onClick: openBulkCredsEdit,
      });
    }

    if (selectedSubmapNodes.length >= 1) {
      items.push({
        id: 'bulk-submap',
        label: `Editar submapas (${selectedSubmapNodes.length})`,
        onClick: openBulkSubmapEdit,
      });
    }

    if (selectedNodes.length > 0) {
      items.push({
        id: 'delete-selection',
        label: deleteNodesMenuLabel(selectedNodes.length),
        variant: 'delete',
        onClick: deleteSelectedNodes,
      });
    }

    items.push(
      {
        id: 'add-host',
        label: 'Adicionar host',
        onClick: () => {
          closeMenu();
          openAddHost({ mapX: snapCoord(mapX), mapY: snapCoord(mapY) });
        },
      },
      {
        id: 'add-device',
        label: 'Adicionar dispositivo manual',
        onClick: () => persist(addManualDeviceAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-submap',
        label: 'Adicionar submapa',
        onClick: () => persist(addSubmapAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-dashboard-picker',
        label: 'Adicionar seletor de dashboards',
        onClick: () => persist(addDashboardPickerAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-network',
        label: 'Adicionar rede',
        onClick: () => persist(addNetworkAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-static',
        label: 'Adicionar estático',
        onClick: () => persist(addStaticAt(storedMap, snapCoord(mapX), snapCoord(mapY))),
      },
      {
        id: 'add-link',
        label: 'Adicionar link',
        onClick: beginLinkFromCanvas,
      }
    );

    return items;
  }, [
    anchor,
    beginLinkFromCanvas,
    closeMenu,
    copySelection,
    deleteSelectedNodes,
    openAddHost,
    openBulkCredsEdit,
    openBulkIconEdit,
    openBulkSubmapEdit,
    pasteAt,
    persist,
    selectedHostNodes.length,
    selectedLink,
    selectedNodeIds.length,
    selectedNodes.length,
    selectedSubmapNodes.length,
    snapCoord,
    storedMap,
  ]);

  const linkMenuItems = useCallback(
    (link: TopologyLink): ContextMenuItem[] => {
      const medium = resolveLinkMedium(link);
      return [
        {
          id: 'link-edit',
          label: 'Editar link…',
          onClick: () => {
            closeMenu();
            openLinkEdit(link);
          },
        },
        {
          id: 'link-straight',
          label: 'Linha reta (remover desvios)',
          onClick: () => {
            closeMenu();
            resetLinkRoute(link);
          },
        },
        {
          id: 'link-fiber',
          label: medium === 'fiber' ? '✓ Fibra (linha contínua)' : 'Marcar como fibra',
          onClick: () => persist(updateLinkProps(storedMap, link.from, link.to, { medium: 'fiber' })),
        },
        {
          id: 'link-radio',
          label: medium === 'radio' ? '✓ Rádio (linha tracejada)' : 'Marcar como rádio',
          onClick: () => persist(updateLinkProps(storedMap, link.from, link.to, { medium: 'radio' })),
        },
        {
          id: 'delete-link',
          label: 'Excluir link',
          variant: 'delete',
          onClick: () => persist(removeLinkByEndpoints(storedMap, link.from, link.to)),
        },
      ];
    },
    [closeMenu, openLinkEdit, persist, resetLinkRoute, storedMap]
  );

  const nodeMenuItems = useCallback(
    (node: TopologyNode): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];
      const tools = buildToolsMenu(node);
      if (tools) {
        items.push(tools);
      }

      // Sem edição, o menu do nó é só o Tools.
      if (!editable) {
        return items;
      }

      if (selectedNodeIds.length > 0) {
        items.push({
          id: 'copy-selection',
          label: copySelectionMenuLabel(selectedNodeIds.length),
          onClick: () => {
            closeMenu();
            copySelection();
          },
        });
      }

      if (hasTopologyClipboard()) {
        items.push({
          id: 'paste-here',
          label: 'Colar',
          onClick: () => {
            const at = anchor ?? { mapX: node.x, mapY: node.y };
            pasteAt(snapCoord(at.mapX), snapCoord(at.mapY));
          },
        });
      }

      const nodeInSelection = selectedNodeIds.includes(node.id);

      if (nodeInSelection && isHostNode(node) && selectedHostNodes.length >= 1) {
        items.push({
          id: 'bulk-icon',
          label: `Alterar tipo / ícone (${selectedHostNodes.length} hosts)`,
          onClick: openBulkIconEdit,
        });
        items.push({
          id: 'bulk-creds',
          label: `Usuário / senha Tools (${selectedHostNodes.length} hosts)`,
          onClick: openBulkCredsEdit,
        });
      }

      if (nodeInSelection && isSubmapNode(node) && selectedSubmapNodes.length >= 1) {
        items.push({
          id: 'bulk-submap',
          label: `Editar submapas (${selectedSubmapNodes.length})`,
          onClick: openBulkSubmapEdit,
        });
      }

      // Propriedades é sempre de um nó só: some quando há seleção múltipla incluindo este nó.
      if (selectedNodeIds.length < 2 || !nodeInSelection) {
        items.push({
          id: 'props',
          label: 'Propriedades',
          onClick: () => openNodeProperties(node),
        });
      }

      if (node.type !== 'network') {
        items.push({
          id: 'link-from',
          label: 'Adicionar link daqui',
          onClick: () => beginLinkFrom(node.id),
        });
      }

      const multiDelete = selectedNodeIds.length >= 2 && nodeInSelection && selectedNodes.length >= 2;

      if (multiDelete) {
        items.push({
          id: 'delete-selection',
          label: deleteNodesMenuLabel(selectedNodes.length),
          variant: 'delete',
          onClick: deleteSelectedNodes,
        });
      } else {
        items.push({
          id: 'delete',
          label: deleteNodeMenuLabel(node),
          variant: 'delete',
          onClick: () =>
            removeNodes([
              {
                ...node,
                zabbixHost: node.zabbixHost,
                subtitle: node.subtitle,
                label: node.label,
              },
            ]),
        });
      }
      return items;
    },
    [
      anchor,
      beginLinkFrom,
      buildToolsMenu,
      closeMenu,
      copySelection,
      deleteSelectedNodes,
      editable,
      openBulkCredsEdit,
      openBulkIconEdit,
      openBulkSubmapEdit,
      openNodeProperties,
      pasteAt,
      removeNodes,
      selectedHostNodes.length,
      selectedNodeIds,
      selectedNodes.length,
      selectedSubmapNodes.length,
      snapCoord,
    ]
  );

  return { canvasMenuItems, nodeMenuItems, linkMenuItems };
}
