import { useEffect, useRef } from 'react';
import { eventTargetRequestsDashboardFlush } from '../utils/grafanaDashboardEdit';

/**
 * Roda `onFlush` ao salvar/sair do dashboard, ao ocultar a aba ou no `pagehide`.
 * Trava e modo NOC não chamam `onOptionsChange` no clique — este flush grava o pendente.
 */
export function useGrafanaDashboardFlush(onFlush: () => void): void {
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  useEffect(() => {
    const run = () => onFlushRef.current();
    const onVisibility = () => {
      if (document.hidden) {
        run();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (eventTargetRequestsDashboardFlush(event.target)) {
        run();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        run();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', run);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', run);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
