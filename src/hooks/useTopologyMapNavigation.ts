import { useCallback, useMemo, useRef, useState } from 'react';
import { TopologyView } from '../types';
import {
  ROOT_MAP_ID,
  TopologyBreadcrumbItem,
  TopologyNavFrame,
  buildTopologyBreadcrumb,
  computeBreadcrumbNavigation,
  resolveTopologyMapView,
} from '../utils/topologyMapNavigation';

interface UseTopologyMapNavigationParams {
  rootView?: TopologyView;
  childMapViews?: Record<string, TopologyView>;
  onPersistView?: (mapId: string, view: TopologyView) => void;
}

interface UseTopologyMapNavigationResult {
  currentMapId: string;
  currentLabel: string;
  breadcrumb: TopologyBreadcrumbItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  savedViewForCurrent: TopologyView | undefined;
  navigateToChild: (childMapId: string, label: string, currentView: TopologyView) => void;
  /** Salta direto para um mapa (raiz ou filho) — usado pelo painel NOC. */
  navigateToMapId: (mapId: string, label: string, currentView: TopologyView) => void;
  navigateToBreadcrumb: (index: number, currentView: TopologyView) => void;
  goBack: (currentView: TopologyView) => void;
  goForward: (currentView: TopologyView) => void;
  resetNavigation: () => void;
}

export function useTopologyMapNavigation({
  rootView,
  childMapViews,
  onPersistView,
}: UseTopologyMapNavigationParams): UseTopologyMapNavigationResult {
  const [currentMapId, setCurrentMapId] = useState(ROOT_MAP_ID);
  const [currentLabel, setCurrentLabel] = useState('');
  const [backStack, setBackStack] = useState<TopologyNavFrame[]>([]);
  const [forwardStack, setForwardStack] = useState<TopologyNavFrame[]>([]);
  const sessionViewsRef = useRef<Record<string, TopologyView>>({});

  const persistView = useCallback(
    (mapId: string, view: TopologyView) => {
      sessionViewsRef.current[mapId] = view;
      onPersistView?.(mapId, view);
    },
    [onPersistView]
  );

  const savedViewForCurrent = useMemo(
    () =>
      resolveTopologyMapView(
        { view: rootView, childMapViews },
        currentMapId,
        sessionViewsRef.current
      ),
    [rootView, childMapViews, currentMapId]
  );

  const breadcrumb = useMemo(
    () => buildTopologyBreadcrumb(backStack, currentMapId, currentLabel),
    [backStack, currentMapId, currentLabel]
  );

  const navigateToChild = useCallback(
    (childMapId: string, label: string, currentView: TopologyView) => {
      const trimmedId = childMapId.trim();
      if (!trimmedId) {
        return;
      }
      persistView(currentMapId, currentView);
      setBackStack((prev) => [
        ...prev,
        { mapId: currentMapId, view: currentView, label: currentLabel || 'Início' },
      ]);
      setForwardStack([]);
      setCurrentMapId(trimmedId);
      setCurrentLabel(label.trim() || trimmedId);
    },
    [currentLabel, currentMapId, persistView]
  );

  const navigateToMapId = useCallback(
    (mapId: string, label: string, currentView: TopologyView) => {
      const trimmedId = mapId.trim() || ROOT_MAP_ID;
      if (trimmedId === currentMapId) {
        return;
      }
      persistView(currentMapId, currentView);
      setBackStack([]);
      setForwardStack([]);
      setCurrentMapId(trimmedId);
      setCurrentLabel(trimmedId === ROOT_MAP_ID ? '' : label.trim() || trimmedId);
    },
    [currentMapId, currentLabel, persistView]
  );

  const navigateToBreadcrumb = useCallback(
    (index: number, currentView: TopologyView) => {
      const next = computeBreadcrumbNavigation(
        index,
        backStack,
        forwardStack,
        currentMapId,
        currentLabel,
        currentView
      );
      if (!next) {
        return;
      }
      persistView(currentMapId, currentView);
      setBackStack(next.backStack);
      setForwardStack(next.forwardStack);
      setCurrentMapId(next.currentMapId);
      setCurrentLabel(next.currentLabel);
      sessionViewsRef.current[next.currentMapId] = next.restoredView;
    },
    [backStack, currentLabel, currentMapId, forwardStack, persistView]
  );

  const goBack = useCallback(
    (currentView: TopologyView) => {
      setBackStack((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        const nextBack = [...prev];
        const frame = nextBack.pop();
        if (!frame) {
          return prev;
        }
        persistView(currentMapId, currentView);
        setForwardStack((fwd) => [
          { mapId: currentMapId, view: currentView, label: currentLabel || 'Início' },
          ...fwd,
        ]);
        setCurrentMapId(frame.mapId);
        setCurrentLabel(frame.label);
        sessionViewsRef.current[frame.mapId] = frame.view;
        return nextBack;
      });
    },
    [currentLabel, currentMapId, persistView]
  );

  const goForward = useCallback(
    (currentView: TopologyView) => {
      setForwardStack((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        const nextFwd = [...prev];
        const frame = nextFwd.shift();
        if (!frame) {
          return prev;
        }
        persistView(currentMapId, currentView);
        setBackStack((back) => [
          ...back,
          { mapId: currentMapId, view: currentView, label: currentLabel || 'Início' },
        ]);
        setCurrentMapId(frame.mapId);
        setCurrentLabel(frame.label);
        sessionViewsRef.current[frame.mapId] = frame.view;
        return nextFwd;
      });
    },
    [currentLabel, currentMapId, persistView]
  );

  const resetNavigation = useCallback(() => {
    setCurrentMapId(ROOT_MAP_ID);
    setCurrentLabel('');
    setBackStack([]);
    setForwardStack([]);
    sessionViewsRef.current = {};
  }, []);

  return {
    currentMapId,
    currentLabel,
    breadcrumb,
    canGoBack: backStack.length > 0,
    canGoForward: forwardStack.length > 0,
    savedViewForCurrent,
    navigateToChild,
    navigateToMapId,
    navigateToBreadcrumb,
    goBack,
    goForward,
    resetNavigation,
  };
}
