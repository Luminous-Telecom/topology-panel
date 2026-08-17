import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react';
import { TopologyLink, TopologyMap, TopologyNode } from '../types';
import { findNodeById, isHostNode } from '../utils/topologyNodes';
import { openDashboardUrl } from '../components/DashboardPickerModal';

/** Intervalo máximo entre dois cliques para abrir propriedades (pointer capture bloqueia dblclick nativo). */
const NODE_DOUBLE_TAP_MS = 400;

export function nodeSupportsProperties(node: TopologyNode): boolean {
  return (
    node.type === 'submap' ||
    node.type === 'network' ||
    node.type === 'static' ||
    node.type === 'dashboard_picker' ||
    isHostNode(node)
  );
}

interface UseNodePropertiesModalsParams {
  storedMap: TopologyMap;
  editable: boolean;
  linkFromId: string | null;
}

export interface NodePropertiesModalsState {
  editNode: TopologyNode | null;
  setEditNode: Dispatch<SetStateAction<TopologyNode | null>>;
  pickerNode: TopologyNode | null;
  setPickerNode: Dispatch<SetStateAction<TopologyNode | null>>;
  editLink: TopologyLink | null;
  setEditLink: Dispatch<SetStateAction<TopologyLink | null>>;
  addHostAt: { mapX: number; mapY: number } | null;
  setAddHostAt: Dispatch<SetStateAction<{ mapX: number; mapY: number } | null>>;
  openNodeProperties: (node: TopologyNode) => void;
  openDashboardPicker: (node: TopologyNode) => void;
  tryDoubleTapOpenProperties: (tapNode: TopologyNode) => boolean;
  resetDoubleTapState: () => void;
}

/** Estado dos modais de propriedades de nó/link (editNode, pickerNode, editLink, addHostAt) e abertura via clique/duplo-tap. */
export function useNodePropertiesModals({
  storedMap,
  editable,
  linkFromId,
}: UseNodePropertiesModalsParams): NodePropertiesModalsState {
  const [editNode, setEditNode] = useState<TopologyNode | null>(null);
  const [pickerNode, setPickerNode] = useState<TopologyNode | null>(null);
  const [editLink, setEditLink] = useState<TopologyLink | null>(null);
  const [addHostAt, setAddHostAt] = useState<{ mapX: number; mapY: number } | null>(null);
  const lastNodeTapRef = useRef<{ nodeId: string; time: number } | null>(null);

  const openNodeProperties = useCallback(
    (node: TopologyNode) => {
      const stored = findNodeById(storedMap.nodes, node.id);
      setEditNode(stored ?? node);
    },
    [storedMap]
  );

  const openDashboardPicker = useCallback((node: TopologyNode) => {
    if (node.type !== 'dashboard_picker') {
      return;
    }
    const choices = (node.dashboardChoices ?? []).filter((c) => c.uid?.trim());
    if (choices.length === 1) {
      openDashboardUrl(choices[0].uid, choices[0].slug);
      return;
    }
    setPickerNode(node);
  }, []);

  const resetDoubleTapState = useCallback(() => {
    lastNodeTapRef.current = null;
  }, []);

  const tryDoubleTapOpenProperties = useCallback(
    (tapNode: TopologyNode): boolean => {
      if (!editable || linkFromId !== null || !nodeSupportsProperties(tapNode)) {
        return false;
      }
      const now = Date.now();
      const last = lastNodeTapRef.current;
      if (last && last.nodeId === tapNode.id && now - last.time <= NODE_DOUBLE_TAP_MS) {
        lastNodeTapRef.current = null;
        openNodeProperties(tapNode);
        return true;
      }
      lastNodeTapRef.current = { nodeId: tapNode.id, time: now };
      return false;
    },
    [editable, linkFromId, openNodeProperties]
  );

  return {
    editNode,
    setEditNode,
    pickerNode,
    setPickerNode,
    editLink,
    setEditLink,
    addHostAt,
    setAddHostAt,
    openNodeProperties,
    openDashboardPicker,
    tryDoubleTapOpenProperties,
    resetDoubleTapState,
  };
}
