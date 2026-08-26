import { RefObject, useEffect, useRef, useState } from 'react';

/** Tempo sem movimento do mouse até o chrome sumir em tela cheia. */
export const FULLSCREEN_CHROME_IDLE_MS = 3000;

/** Overlay do mapa que some com o idle (toolbar e navegação). */
export const IDLE_HIDE_CHROME_SELECTOR = '[data-topology-chrome]';

interface UseIdleHideParams {
  enabled: boolean;
  wrapRef: RefObject<HTMLElement>;
  idleMs?: number;
  /** Mantém o chrome visível (ex.: busca aberta). */
  paused?: boolean;
}

function eventTargetsChrome(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(IDLE_HIDE_CHROME_SELECTOR));
}

/**
 * Em tela cheia, esconde o chrome após `idleMs` sem movimento do mouse e mostra de novo
 * no próximo pointermove/pointerdown. Não chama setState a cada movimento — só quando a
 * visibilidade muda. Hover no próprio chrome (ou `paused`) cancela o timer.
 */
export function useIdleHide({
  enabled,
  wrapRef,
  idleMs = FULLSCREEN_CHROME_IDLE_MS,
  paused = false,
}: UseIdleHideParams): boolean {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!enabled || !el) {
      hiddenRef.current = false;
      setHidden(false);
      return;
    }

    let timer: number | undefined;
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const reveal = () => {
      if (!hiddenRef.current) {
        return;
      }
      hiddenRef.current = false;
      setHidden(false);
    };

    const scheduleHide = () => {
      clearTimer();
      if (paused) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        hiddenRef.current = true;
        setHidden(true);
      }, idleMs);
    };

    const onPointerActivity = (e: Event) => {
      reveal();
      if (paused || eventTargetsChrome(e.target)) {
        clearTimer();
        return;
      }
      scheduleHide();
    };

    el.addEventListener('pointermove', onPointerActivity, { capture: true, passive: true });
    el.addEventListener('pointerdown', onPointerActivity, { capture: true, passive: true });
    if (paused) {
      reveal();
    } else {
      scheduleHide();
    }

    return () => {
      clearTimer();
      el.removeEventListener('pointermove', onPointerActivity, true);
      el.removeEventListener('pointerdown', onPointerActivity, true);
    };
  }, [enabled, idleMs, paused, wrapRef]);

  return hidden;
}
