import { MutableRefObject, RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { TopologyView } from '../types';
import { DragState, EDGE_PAN_MAX_SPEED, EDGE_PAN_THRESHOLD } from '../utils/dragState';
import { computeEdgePanVelocity } from '../utils/edgePan';

export interface EdgePanLoopParams {
  wrapRef: RefObject<HTMLDivElement>;
  svgRef: RefObject<SVGSVGElement>;
  enablePan: boolean;
  viewRef: MutableRefObject<TopologyView>;
  commitView: (next: TopologyView | ((prev: TopologyView) => TopologyView)) => void;
  /** Gesto atual — o loop só roda enquanto for um arraste de nó já em movimento. */
  dragRef: MutableRefObject<DragState | null>;
  /**
   * Reaplica o arraste na posição atual do ponteiro depois de cada deslocamento da view.
   *
   * Vem por ref porque quem move o nó também precisa iniciar este loop: sem a indireção, as duas
   * funções se referenciariam antes de existirem.
   */
  applyMoveRef: MutableRefObject<(clientX: number, clientY: number) => void>;
}

export interface EdgePanLoopApi {
  /** Última posição conhecida do ponteiro — o loop usa entre `pointermove`. */
  pointerRef: MutableRefObject<{ clientX: number; clientY: number } | null>;
  rect: () => DOMRect | null;
  start: () => void;
  stop: () => void;
}

/**
 * Pan automático quando o nó arrastado chega perto da borda do painel, para dar para levá-lo a uma
 * área ainda não visível sem soltar.
 *
 * Roda em `requestAnimationFrame` com velocidade proporcional à distância da borda e passo por
 * tempo decorrido (`dt`), para a rolagem não variar com a taxa de quadros da máquina.
 */
export function useEdgePanLoop({
  wrapRef,
  svgRef,
  enablePan,
  viewRef,
  commitView,
  dragRef,
  applyMoveRef,
}: EdgePanLoopParams): EdgePanLoopApi {
  const rafRef = useRef<number | null>(null);
  const prevTsRef = useRef<number | null>(null);
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    prevTsRef.current = null;
  }, []);

  const rect = useCallback((): DOMRect | null => {
    return svgRef.current?.getBoundingClientRect() ?? wrapRef.current?.getBoundingClientRect() ?? null;
  }, [svgRef, wrapRef]);

  const runFrame = useCallback(
    (timestamp: number) => {
      const d = dragRef.current;
      const ptr = pointerRef.current;
      if (!d || d.kind !== 'node' || !d.moved || !enablePan || !ptr) {
        rafRef.current = null;
        prevTsRef.current = null;
        return;
      }

      const bounds = rect();
      if (!bounds) {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }

      const prevTs = prevTsRef.current ?? timestamp;
      prevTsRef.current = timestamp;
      const dt = Math.min((timestamp - prevTs) / 1000, 0.05);

      const { vx, vy } = computeEdgePanVelocity(
        ptr.clientX,
        ptr.clientY,
        bounds,
        EDGE_PAN_THRESHOLD,
        EDGE_PAN_MAX_SPEED
      );

      if (vx !== 0 || vy !== 0) {
        const v = viewRef.current;
        commitView({ ...v, x: v.x + vx * dt, y: v.y + vy * dt });
        applyMoveRef.current(ptr.clientX, ptr.clientY);
      }

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [applyMoveRef, commitView, dragRef, enablePan, rect, viewRef]
  );

  const start = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    prevTsRef.current = null;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  useEffect(() => () => stop(), [stop]);

  // Identidade estável: este objeto entra nas dependências dos handlers de ponteiro, que precisam
  // sobreviver a re-renders para não refazer o `useCallback` a cada frame do arraste.
  return useMemo(() => ({ pointerRef, rect, start, stop }), [rect, start, stop]);
}
