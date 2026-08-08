import { useCallback, useEffect, useRef, useState } from 'react';
import { TopologyMap } from '../types';

const MAX_HISTORY = 50;

function cloneMap(map: TopologyMap): TopologyMap {
  return JSON.parse(JSON.stringify(map)) as TopologyMap;
}

/** Desfazer / refazer alterações do mapa (Ctrl+Z / Ctrl+Shift+Z). */
export function useMapHistory(currentMap: TopologyMap, applyMap: (map: TopologyMap) => void) {
  const pastRef = useRef<TopologyMap[]>([]);
  const futureRef = useRef<TopologyMap[]>([]);
  const committedJsonRef = useRef(JSON.stringify(currentMap));
  const snapshotRef = useRef(currentMap);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  /** Mapa trocado externamente (dashboard recarregado) — zera histórico. */
  useEffect(() => {
    const json = JSON.stringify(currentMap);
    if (json === committedJsonRef.current) {
      snapshotRef.current = currentMap;
      return;
    }
    pastRef.current = [];
    futureRef.current = [];
    committedJsonRef.current = json;
    snapshotRef.current = currentMap;
    bump();
  }, [currentMap]);

  const commitChange = useCallback(
    (map: TopologyMap) => {
      const nextJson = JSON.stringify(map);
      const prevJson = JSON.stringify(snapshotRef.current);
      if (nextJson !== prevJson) {
        pastRef.current.push(cloneMap(snapshotRef.current));
        if (pastRef.current.length > MAX_HISTORY) {
          pastRef.current.shift();
        }
        futureRef.current = [];
      }
      snapshotRef.current = map;
      committedJsonRef.current = nextJson;
      applyMap(map);
      bump();
    },
    [applyMap]
  );

  const undo = useCallback(() => {
    if (!pastRef.current.length) {
      return;
    }
    futureRef.current.push(cloneMap(snapshotRef.current));
    const prev = pastRef.current.pop()!;
    snapshotRef.current = prev;
    committedJsonRef.current = JSON.stringify(prev);
    applyMap(prev);
    bump();
  }, [applyMap]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) {
      return;
    }
    pastRef.current.push(cloneMap(snapshotRef.current));
    const next = futureRef.current.pop()!;
    snapshotRef.current = next;
    committedJsonRef.current = JSON.stringify(next);
    applyMap(next);
    bump();
  }, [applyMap]);

  return {
    commitChange,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
