import { useCallback, useEffect, useRef, useState } from 'react';
import { TopologyNode } from '../types';

export interface HostHoverTarget {
  node: TopologyNode;
  screenX: number;
  screenY: number;
}

interface HostHoverApi {
  hostHover: HostHoverTarget | null;
  beginHostHover: (target: HostHoverTarget) => void;
  moveHostHover: (target: HostHoverTarget) => void;
  endHostHover: (nodeId: string) => void;
  clearHostHover: () => void;
}

/**
 * Alvo do popover de hover do host.
 *
 * O `mousemove` sobre um nó dispara dezenas de eventos por segundo e cada `setState` redesenha a
 * árvore SVG inteira do canvas. O movimento é coalescido em um commit por frame — o popover só
 * precisa acompanhar o ponteiro visualmente, não a cada evento.
 */
export function useHostHoverTarget(): HostHoverApi {
  const [hostHover, setHostHover] = useState<HostHoverTarget | null>(null);
  const pendingRef = useRef<HostHoverTarget | null>(null);
  const rafRef = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const beginHostHover = useCallback(
    (target: HostHoverTarget) => {
      cancelPending();
      setHostHover(target);
    },
    [cancelPending]
  );

  const moveHostHover = useCallback((target: HostHoverTarget) => {
    pendingRef.current = target;
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) {
        return;
      }
      // Só acompanha o ponteiro se o popover ainda for do mesmo nó — sair do nó antes do frame
      // chegar não pode ressuscitar o hover.
      setHostHover((prev) => (prev?.node.id === pending.node.id ? pending : prev));
    });
  }, []);

  const endHostHover = useCallback(
    (nodeId: string) => {
      cancelPending();
      setHostHover((prev) => (prev?.node.id === nodeId ? null : prev));
    },
    [cancelPending]
  );

  const clearHostHover = useCallback(() => {
    cancelPending();
    setHostHover(null);
  }, [cancelPending]);

  return { hostHover, beginHostHover, moveHostHover, endHostHover, clearHostHover };
}
