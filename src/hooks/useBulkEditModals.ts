import { useCallback, useState } from 'react';
import { TopologyNode } from '../types';

interface UseBulkEditModalsParams {
  selectedHostNodes: TopologyNode[];
  selectedSubmapNodes: TopologyNode[];
  showToast: (message: string) => void;
  closeContextMenu: () => void;
}

/** Estado e abertura dos 3 modais de edição em lote (ícone, credenciais Tools, submapas) do menu de contexto. */
export function useBulkEditModals({
  selectedHostNodes,
  selectedSubmapNodes,
  showToast,
  closeContextMenu,
}: UseBulkEditModalsParams): {
  bulkIconEditOpen: boolean;
  setBulkIconEditOpen: (open: boolean) => void;
  bulkIconTargets: TopologyNode[];
  setBulkIconTargets: (targets: TopologyNode[]) => void;
  bulkCredsEditOpen: boolean;
  setBulkCredsEditOpen: (open: boolean) => void;
  bulkCredsTargets: TopologyNode[];
  setBulkCredsTargets: (targets: TopologyNode[]) => void;
  bulkSubmapEditOpen: boolean;
  setBulkSubmapEditOpen: (open: boolean) => void;
  bulkSubmapTargets: TopologyNode[];
  setBulkSubmapTargets: (targets: TopologyNode[]) => void;
  openBulkIconEdit: () => void;
  openBulkCredsEdit: () => void;
  openBulkSubmapEdit: () => void;
} {
  const [bulkIconEditOpen, setBulkIconEditOpen] = useState(false);
  const [bulkIconTargets, setBulkIconTargets] = useState<TopologyNode[]>([]);
  const [bulkCredsEditOpen, setBulkCredsEditOpen] = useState(false);
  const [bulkCredsTargets, setBulkCredsTargets] = useState<TopologyNode[]>([]);
  const [bulkSubmapEditOpen, setBulkSubmapEditOpen] = useState(false);
  const [bulkSubmapTargets, setBulkSubmapTargets] = useState<TopologyNode[]>([]);

  const openBulkIconEdit = useCallback(() => {
    if (!selectedHostNodes.length) {
      showToast('Nenhum host válido na seleção');
      return;
    }
    setBulkIconTargets(selectedHostNodes);
    closeContextMenu();
    setBulkIconEditOpen(true);
  }, [closeContextMenu, selectedHostNodes, showToast]);

  const openBulkCredsEdit = useCallback(() => {
    if (!selectedHostNodes.length) {
      showToast('Nenhum host válido na seleção');
      return;
    }
    setBulkCredsTargets(selectedHostNodes);
    closeContextMenu();
    setBulkCredsEditOpen(true);
  }, [closeContextMenu, selectedHostNodes, showToast]);

  const openBulkSubmapEdit = useCallback(() => {
    if (!selectedSubmapNodes.length) {
      showToast('Nenhum submapa válido na seleção');
      return;
    }
    setBulkSubmapTargets(selectedSubmapNodes);
    closeContextMenu();
    setBulkSubmapEditOpen(true);
  }, [closeContextMenu, selectedSubmapNodes, showToast]);

  return {
    bulkIconEditOpen,
    setBulkIconEditOpen,
    bulkIconTargets,
    setBulkIconTargets,
    bulkCredsEditOpen,
    setBulkCredsEditOpen,
    bulkCredsTargets,
    setBulkCredsTargets,
    bulkSubmapEditOpen,
    setBulkSubmapEditOpen,
    bulkSubmapTargets,
    setBulkSubmapTargets,
    openBulkIconEdit,
    openBulkCredsEdit,
    openBulkSubmapEdit,
  };
}
