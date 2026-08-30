import { useEffect, useRef, useState } from 'react';
import { locationService } from '@grafana/runtime';
import { observeGrafanaChrome } from '../utils/grafanaChromeObserve';

/**
 * Flag booleana do chrome Grafana (URL via `locationService` + DOM).
 * Usado por edição de dashboard e playlist — o observer ignora o SVG do mapa.
 */
export function useGrafanaChromeFlag(read: () => boolean): boolean {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useState(() => read());

  useEffect(() => {
    const sync = () => {
      const next = readRef.current();
      setValue((prev) => (prev === next ? prev : next));
    };
    sync();

    let unlisten: (() => void) | undefined;
    try {
      unlisten = locationService.getHistory().listen(sync);
    } catch {
      unlisten = undefined;
    }

    const stopObserve = observeGrafanaChrome(sync);
    return () => {
      unlisten?.();
      stopObserve();
    };
  }, []);

  return value;
}
