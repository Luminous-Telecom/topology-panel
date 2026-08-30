import { useCallback, useEffect, useRef, useState } from 'react';
import { TopologyMap } from '../types';
import { mapRevisionChanged, sameNodeGeometry } from '../utils/mapRevision';
import { scheduleAfterPaint, scheduleWhenIdle } from '../utils/scheduleAfterPaint';
import { useGrafanaDashboardFlush } from './useGrafanaDashboardFlush';

const MAX_HISTORY = 50;
/** Grafana `onOptionsChange` depois do mapa local — no pointerup isso congelava o canvas. */
const GRAFANA_PERSIST_IDLE_MS = 400;

function cloneMap(map: TopologyMap): TopologyMap {
  return structuredClone(map);
}

/**
 * Desfazer / refazer alterações do mapa (Ctrl+Z / Ctrl+Shift+Z).
 *
 * Com `persistRemote`, o pointerup **não** chama `applyMap` nem grava no Grafana: o preview
 * segura a posição. No idle entram o mapa local e, num idle seguinte, o JSON das opções.
 * Troca só de trava/dimensão (mesmos `nodes`/`links`) aplica o mapa local na hora e **não**
 * chama `onOptionsChange` no idle curto — o JSON inteiro congelava o tráfego. A gravação
 * entra no próximo arraste, no flush, ao salvar/sair do dashboard ou ao ocultar a aba.
 */
export function useMapHistory(
  currentMap: TopologyMap,
  applyMap: (map: TopologyMap) => void,
  persistRemote?: (map: TopologyMap) => void
) {
  const pastRef = useRef<TopologyMap[]>([]);
  const futureRef = useRef<TopologyMap[]>([]);
  const committedJsonRef = useRef(JSON.stringify(currentMap));
  const snapshotRef = useRef(currentMap);
  const pendingRemoteRef = useRef<TopologyMap | null>(null);
  const pendingGrafanaRef = useRef<TopologyMap | null>(null);
  const cancelRemoteRef = useRef<(() => void) | null>(null);
  const cancelGrafanaRef = useRef<(() => void) | null>(null);
  const persistRemoteRef = useRef(persistRemote);
  persistRemoteRef.current = persistRemote;
  const applyMapRef = useRef(applyMap);
  applyMapRef.current = applyMap;
  const pendingLocalCommitRef = useRef(false);
  const unclonedPastRef = useRef(new Set<TopologyMap>());
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const clonePendingHistory = useCallback(() => {
    const uncloned = unclonedPastRef.current;
    if (uncloned.size === 0) {
      return;
    }
    pastRef.current = pastRef.current.map((map) => {
      if (!uncloned.has(map)) {
        return map;
      }
      uncloned.delete(map);
      return cloneMap(map);
    });
  }, []);

  const applyPendingLocal = useCallback(() => {
    const next = pendingRemoteRef.current;
    pendingRemoteRef.current = null;
    pendingLocalCommitRef.current = false;
    clonePendingHistory();
    if (!next) {
      return;
    }
    applyMapRef.current(next);
    pendingGrafanaRef.current = next;
  }, [clonePendingHistory]);

  const persistGrafanaNow = useCallback(() => {
    const next = pendingGrafanaRef.current;
    pendingGrafanaRef.current = null;
    if (!next) {
      return;
    }
    persistRemoteRef.current?.(next);
  }, []);

  const scheduleGrafanaPersist = useCallback(() => {
    cancelGrafanaRef.current?.();
    if (!pendingGrafanaRef.current || !persistRemoteRef.current) {
      return;
    }
    cancelGrafanaRef.current = scheduleWhenIdle(() => {
      cancelGrafanaRef.current = null;
      persistGrafanaNow();
    }, GRAFANA_PERSIST_IDLE_MS);
  }, [persistGrafanaNow]);

  const persistPending = useCallback(() => {
    applyPendingLocal();
    scheduleGrafanaPersist();
  }, [applyPendingLocal, scheduleGrafanaPersist]);

  const flushRemote = useCallback(() => {
    cancelRemoteRef.current?.();
    cancelRemoteRef.current = null;
    cancelGrafanaRef.current?.();
    cancelGrafanaRef.current = null;
    const hadPending = pendingRemoteRef.current != null || pendingGrafanaRef.current != null;
    applyPendingLocal();
    persistGrafanaNow();
    if (hadPending) {
      bump();
    }
  }, [applyPendingLocal, persistGrafanaNow]);

  const scheduleRemote = useCallback(
    (map: TopologyMap) => {
      if (!persistRemoteRef.current) {
        clonePendingHistory();
        return;
      }
      pendingRemoteRef.current = map;
      pendingLocalCommitRef.current = true;
      if (cancelRemoteRef.current) {
        return;
      }
      let cancelIdle: (() => void) | null = null;
      const cancelPaint = scheduleAfterPaint(() => {
        cancelIdle = scheduleWhenIdle(() => {
          cancelRemoteRef.current = null;
          persistPending();
        });
        cancelRemoteRef.current = () => cancelIdle?.();
      });
      cancelRemoteRef.current = () => {
        cancelPaint();
        cancelIdle?.();
      };
    },
    [clonePendingHistory, persistPending]
  );

  useEffect(
    () => () => {
      flushRemote();
    },
    [flushRemote]
  );

  useGrafanaDashboardFlush(flushRemote);

  /** Mapa trocado externamente (dashboard recarregado) — zera histórico. */
  useEffect(() => {
    if (pendingLocalCommitRef.current) {
      return;
    }
    if (currentMap === snapshotRef.current) {
      return;
    }
    if (sameNodeGeometry(snapshotRef.current, currentMap)) {
      snapshotRef.current = currentMap;
      return;
    }
    const json = JSON.stringify(currentMap);
    if (json === committedJsonRef.current) {
      snapshotRef.current = currentMap;
      return;
    }
    pastRef.current = [];
    futureRef.current = [];
    unclonedPastRef.current.clear();
    committedJsonRef.current = json;
    snapshotRef.current = currentMap;
    bump();
  }, [currentMap]);

  const commitChange = useCallback(
    (map: TopologyMap) => {
      const prev = snapshotRef.current;
      const dirty = mapRevisionChanged(prev, map);
      let nextJson: string | undefined;
      if (!dirty) {
        nextJson = JSON.stringify(map);
        if (nextJson === committedJsonRef.current) {
          snapshotRef.current = map;
          if (persistRemoteRef.current) {
            scheduleRemote(map);
            return;
          }
          applyMap(map);
          return;
        }
      }
      if (persistRemoteRef.current) {
        pastRef.current.push(prev);
        unclonedPastRef.current.add(prev);
      } else {
        pastRef.current.push(cloneMap(prev));
      }
      if (pastRef.current.length > MAX_HISTORY) {
        const dropped = pastRef.current.shift();
        if (dropped) {
          unclonedPastRef.current.delete(dropped);
        }
      }
      futureRef.current = [];
      snapshotRef.current = map;
      if (nextJson !== undefined) {
        committedJsonRef.current = nextJson;
      }
      if (persistRemoteRef.current) {
        // Trava/dimensão: mesmos nodes/links — pinta na hora. Não gravar no Grafana
        // agora: onOptionsChange do JSON inteiro congela o tráfego por alguns segundos.
        if (prev.nodes === map.nodes && prev.links === map.links) {
          applyMap(map);
          pendingGrafanaRef.current = map;
          bump();
          return;
        }
        scheduleRemote(map);
        return;
      }
      applyMap(map);
      bump();
    },
    [applyMap, scheduleRemote]
  );

  const undo = useCallback(() => {
    if (!pastRef.current.length) {
      return;
    }
    clonePendingHistory();
    futureRef.current.push(cloneMap(snapshotRef.current));
    const prev = pastRef.current.pop()!;
    snapshotRef.current = prev;
    committedJsonRef.current = JSON.stringify(prev);
    applyMap(prev);
    scheduleRemote(prev);
    bump();
  }, [applyMap, clonePendingHistory, scheduleRemote]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) {
      return;
    }
    clonePendingHistory();
    pastRef.current.push(cloneMap(snapshotRef.current));
    const next = futureRef.current.pop()!;
    snapshotRef.current = next;
    committedJsonRef.current = JSON.stringify(next);
    applyMap(next);
    scheduleRemote(next);
    bump();
  }, [applyMap, clonePendingHistory, scheduleRemote]);

  return {
    commitChange,
    undo,
    redo,
    flushRemote,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
