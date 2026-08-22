import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { TopologyLink, TopologyNode } from '../types';
import { findNodeById, isHostNode, isSubmapNode } from '../utils/topologyNodes';

/**
 * Clique simples substitui a seleção. Com Ctrl/Cmd, inclui ou tira o nó da lista.
 */
export function nextSelectedNodeIds(prev: string[], nodeId: string, additive: boolean): string[] {
  if (!additive) {
    return [nodeId];
  }
  if (prev.includes(nodeId)) {
    return prev.filter((id) => id !== nodeId);
  }
  return [...prev, nodeId];
}

/**
 * Clique com a seta no `pointerdown`: seleciona na hora. Se o nó já está na seleção,
 * mantém o grupo para arrastar vários juntos (sem Ctrl).
 */
export function nextSelectedNodeIdsOnPointerDown(
  prev: string[],
  nodeId: string,
  additive: boolean
): string[] {
  if (additive) {
    return nextSelectedNodeIds(prev, nodeId, true);
  }
  if (prev.includes(nodeId)) {
    return prev;
  }
  return [nodeId];
}

/** Estado de seleção do canvas (nós e link) + listas derivadas por tipo, usadas por menu de contexto e ações em lote. */
export function useTopologySelection(nodes: TopologyNode[]): {
  selectedNodeIds: string[];
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  selectedLink: TopologyLink | null;
  setSelectedLink: Dispatch<SetStateAction<TopologyLink | null>>;
  selectedHostNodes: TopologyNode[];
  selectedSubmapNodes: TopologyNode[];
  selectedNodes: TopologyNode[];
} {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedLink, setSelectedLink] = useState<TopologyLink | null>(null);

  const selectedHostNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => findNodeById(nodes, id))
        .filter((n): n is TopologyNode => Boolean(n && isHostNode(n))),
    [nodes, selectedNodeIds]
  );

  const selectedSubmapNodes = useMemo(
    () =>
      selectedNodeIds
        .map((id) => findNodeById(nodes, id))
        .filter((n): n is TopologyNode => Boolean(n && isSubmapNode(n))),
    [nodes, selectedNodeIds]
  );

  const selectedNodes = useMemo(
    () => selectedNodeIds.map((id) => findNodeById(nodes, id)).filter((n): n is TopologyNode => Boolean(n)),
    [nodes, selectedNodeIds]
  );

  return {
    selectedNodeIds,
    setSelectedNodeIds,
    selectedLink,
    setSelectedLink,
    selectedHostNodes,
    selectedSubmapNodes,
    selectedNodes,
  };
}
