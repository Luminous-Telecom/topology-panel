import { ContextMenuItem } from '../components/TopologyContextMenu';
import { TopologyLink, TopologyMap, TopologyNode } from '../types';
import { resolveLinkMedium } from './linkMedium';
import { removeLink, updateLinkProps } from './mapLinkEdits';

export function deleteNodesMenuLabel(count: number): string {
  return count > 1 ? `Excluir seleção (${count})` : 'Excluir seleção';
}

export function deleteNodeMenuLabel(node: TopologyNode): string {
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

/** Itens que os menus do canvas e do nó têm em comum. */
export function copySelectionItem(count: number, onCopy: () => void): ContextMenuItem {
  return {
    id: 'copy-selection',
    label: count > 1 ? `Copiar seleção (${count})` : 'Copiar seleção',
    onClick: onCopy,
  };
}

export function pasteItem(label: string, onPaste: () => void): ContextMenuItem {
  return { id: 'paste-here', label, onClick: onPaste };
}

export function bulkHostItems(
  count: number,
  openIconEdit: () => void,
  openCredsEdit: () => void
): ContextMenuItem[] {
  return [
    { id: 'bulk-icon', label: `Alterar tipo / ícone (${count} hosts)`, onClick: openIconEdit },
    { id: 'bulk-creds', label: `Usuário / senha Tools (${count} hosts)`, onClick: openCredsEdit },
  ];
}

export function bulkSubmapItem(count: number, openSubmapEdit: () => void): ContextMenuItem {
  return { id: 'bulk-submap', label: `Editar submapas (${count})`, onClick: openSubmapEdit };
}

export function enterChildMapItem(onEnter: () => void): ContextMenuItem {
  return { id: 'enter-child-map', label: 'Entrar no mapa interno', onClick: onEnter };
}

export function deleteSelectionItem(count: number, onDelete: () => void): ContextMenuItem {
  return {
    id: 'delete-selection',
    label: deleteNodesMenuLabel(count),
    variant: 'delete',
    onClick: onDelete,
  };
}

interface LinkMenuParams {
  link: TopologyLink;
  storedMap: TopologyMap;
  persist: (map: TopologyMap) => void;
  closeMenu: () => void;
  openLinkEdit: (link: TopologyLink) => void;
  openLinkDetails: (link: TopologyLink) => void;
  resetLinkRoute: (link: TopologyLink) => void;
}

/** Menu do cabo: edição, rota reta, meio físico e exclusão. */
export function buildLinkMenuItems({
  link,
  storedMap,
  persist,
  closeMenu,
  openLinkEdit,
  openLinkDetails,
  resetLinkRoute,
}: LinkMenuParams): ContextMenuItem[] {
  const medium = resolveLinkMedium(link);
  return [
    {
      id: 'link-details',
      label: 'Ver detalhes',
      onClick: () => {
        closeMenu();
        openLinkDetails(link);
      },
    },
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
      onClick: () => persist(updateLinkProps(storedMap, link, { medium: 'fiber' })),
    },
    {
      id: 'link-radio',
      label: medium === 'radio' ? '✓ Rádio (linha tracejada)' : 'Marcar como rádio',
      onClick: () => persist(updateLinkProps(storedMap, link, { medium: 'radio' })),
    },
    {
      id: 'delete-link',
      label: 'Excluir link',
      variant: 'delete',
      onClick: () => persist(removeLink(storedMap, link)),
    },
  ];
}
