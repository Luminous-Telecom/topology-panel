import { RefObject, useCallback, useEffect, useState } from 'react';

interface UseFullscreenParams {
  wrapRef: RefObject<HTMLElement>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  showToast: (message: string | undefined) => void;
}

/** Tela cheia do painel, com o estado sempre lido do documento (o usuário pode sair pelo Esc). */
export function useFullscreen({ wrapRef, onFullscreenChange, showToast }: UseFullscreenParams) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => {
      const el = wrapRef.current;
      const fs = Boolean(el && document.fullscreenElement === el);
      setIsFullscreen(fs);
      onFullscreenChange?.(fs);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        // Outro elemento está em tela cheia: sai dele antes, senão o pedido é ignorado.
        await document.exitFullscreen();
        await el.requestFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      showToast('Não foi possível alternar a tela cheia neste navegador');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isFullscreen, toggleFullscreen };
}
