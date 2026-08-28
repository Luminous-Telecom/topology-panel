import { useEffect, useMemo, useRef } from 'react';

export interface GestureFrame {
  /** Agenda o commit do preview, substituindo o que ainda estiver pendente no frame. */
  schedule: (commit: () => void) => void;
  /** Descarta o commit pendente. Use ao encerrar o gesto, depois de ler o valor final do ref. */
  cancel: () => void;
}

/**
 * Coalesce em um `requestAnimationFrame` o `setState` de preview de um gesto contínuo.
 *
 * O ponteiro emite muito mais eventos do que o navegador pinta: sem isso, cada `pointermove` de
 * arraste vira um render do canvas inteiro. Só o último commit de cada frame interessa — o preview
 * é sempre a posição atual, nunca um acumulado, então substituir o pendente é o comportamento certo.
 *
 * Quem fecha o gesto chama `cancel`: a posição gravada vale pelos refs do gesto
 * (`dragPositionsRef`, `resizePreviewRef`, `d.waypoints`), não por este preview.
 */
export function useGestureFrame(): GestureFrame {
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const frame = useMemo<GestureFrame>(() => {
    const run = () => {
      rafRef.current = null;
      const commit = pendingRef.current;
      pendingRef.current = null;
      commit?.();
    };
    return {
      schedule: (commit: () => void) => {
        pendingRef.current = commit;
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(run);
        }
      },
      cancel: () => {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        pendingRef.current = null;
      },
    };
  }, []);

  useEffect(() => frame.cancel, [frame]);

  return frame;
}
