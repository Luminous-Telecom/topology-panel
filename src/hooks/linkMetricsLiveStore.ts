import { createContext, useContext } from 'react';
import { LinkRuntimeMetricsMap } from '../types';

const EMPTY: LinkRuntimeMetricsMap = {};

export interface LinkMetricsLiveStore {
  getLive: () => LinkRuntimeMetricsMap;
  getPaint: () => LinkRuntimeMetricsMap;
  /** Assinatura só para sincronizar pílulas no DOM — não dispara React. */
  subscribeDom: (listener: () => void) => () => void;
  publish: (live: LinkRuntimeMetricsMap, paint: LinkRuntimeMetricsMap) => void;
}

export function createLinkMetricsLiveStore(): LinkMetricsLiveStore {
  let live: LinkRuntimeMetricsMap = EMPTY;
  let paint: LinkRuntimeMetricsMap = EMPTY;
  const domListeners = new Set<() => void>();
  let domRaf = 0;

  const flushDom = () => {
    domRaf = 0;
    for (const listener of domListeners) {
      listener();
    }
  };

  const scheduleDom = () => {
    if (domRaf) {
      return;
    }
    domRaf = requestAnimationFrame(flushDom);
  };

  return {
    getLive: () => live,
    getPaint: () => paint,
    subscribeDom: (listener) => {
      domListeners.add(listener);
      return () => domListeners.delete(listener);
    },
    publish: (nextLive, nextPaint) => {
      live = nextLive;
      paint = nextPaint;
      scheduleDom();
    },
  };
}

export const LinkMetricsLiveStoreContext = createContext<LinkMetricsLiveStore | null>(null);

const FALLBACK_STORE: LinkMetricsLiveStore = {
  getLive: () => EMPTY,
  getPaint: () => EMPTY,
  subscribeDom: () => () => {},
  publish: () => {},
};

export function useLinkMetricsLiveStore(): LinkMetricsLiveStore {
  return useContext(LinkMetricsLiveStoreContext) ?? FALLBACK_STORE;
}
