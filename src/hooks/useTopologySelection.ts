import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { TopologyLink, TopologyNode } from '../types';
import { findNodeById, isHostNode, isSubmapNode } from '../utils';

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
