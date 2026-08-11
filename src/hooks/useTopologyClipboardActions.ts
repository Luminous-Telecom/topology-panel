import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { TopologyLink, TopologyMap, TopologyView } from '../types';
import {
  copyTopologySelection,
  getTopologyClipboard,
  hasTopologyClipboard,
  pasteTopologySelection,
  subscribeTopologyClipboard,
} from '../utils/topologyClipboard';

interface UseTopologyClipboardActionsParams {
  map: TopologyMap;
  storedMap: TopologyMap;
  selectedNodeIds: string[];
  selectedLink: TopologyLink | null;
  showToast: (message: string | undefined) => void;
  persist: (next: TopologyMap) => void;
  snapCoord: (n: number) => number;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setSelectedLink: Dispatch<SetStateAction<TopologyLink | null>>;
  closeContextMenu: () => void;
  wrapRef: RefObject<HTMLDivElement>;
  view: TopologyView;
}

/** Copiar/colar seleção do canvas — sincroniza com a área de transferência compartilhada entre painéis (`topologyClipboard.ts`). */
export function useTopologyClipboardActions({
  map,
  storedMap,
  selectedNodeIds,
  selectedLink,
  showToast,
  persist,
  snapCoord,
  setSelectedNodeIds,
  setSelectedLink,
  closeContextMenu,
  wrapRef,
  view,
}: UseTopologyClipboardActionsParams): {
  clipboardReady: boolean;
  copySelection: () => void;
  pasteAt: (anchorX: number, anchorY: number) => void;
  pasteAtViewCenter: () => void;
} {
  const [clipboardReady, setClipboardReady] = useState(() => hasTopologyClipboard());
  const pasteOffsetRef = useRef(0);

  useEffect(() => {
    const sync = () => setClipboardReady(hasTopologyClipboard());
    sync();
    return subscribeTopologyClipboard(sync);
  }, []);

  const copySelection = useCallback(() => {
    const payload = copyTopologySelection(map, storedMap, selectedNodeIds, selectedLink);
    if (!payload) {
      showToast('Nada selecionado para copiar');
      return;
    }
    pasteOffsetRef.current = 0;
    const linkHint = payload.links.length > 0 ? ` · ${payload.links.length} link(s)` : '';
    showToast(`${payload.nodes.length} elemento(s) copiado(s)${linkHint}`);
  }, [map, selectedLink, selectedNodeIds, showToast, storedMap]);

  const pasteAt = useCallback(
    (anchorX: number, anchorY: number) => {
      const payload = getTopologyClipboard();
      if (!payload) {
        showToast('Nada copiado — selecione e use Ctrl+C primeiro');
        return;
      }
      const offset = pasteOffsetRef.current;
      pasteOffsetRef.current += 1;
      const result = pasteTopologySelection(storedMap, payload, anchorX, anchorY, snapCoord, offset);
      persist(result.map);
      setSelectedNodeIds(result.pastedNodeIds);
      setSelectedLink(null);
      closeContextMenu();
      showToast(`${result.pastedNodeIds.length} elemento(s) colado(s)`);
    },
    [closeContextMenu, persist, setSelectedLink, setSelectedNodeIds, showToast, snapCoord, storedMap]
  );

  const pasteAtViewCenter = useCallback(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const x = (el.clientWidth / 2 - view.x) / view.scale;
    const y = (el.clientHeight / 2 - view.y) / view.scale;
    pasteAt(x, y);
  }, [pasteAt, view.scale, view.x, view.y, wrapRef]);

  return { clipboardReady, copySelection, pasteAt, pasteAtViewCenter };
}
