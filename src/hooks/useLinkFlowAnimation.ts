import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { LinkFlowController, startLinkFlowAnimation } from '../utils/linkFlow';

/** Anima os tracejados de download/upload dos links (setas em movimento) e permite pausar. */
export function useLinkFlowAnimation(wrapRef: RefObject<HTMLDivElement>): {
  flowPaused: boolean;
  setFlowPaused: Dispatch<SetStateAction<boolean>>;
} {
  const linkFlowRef = useRef<LinkFlowController | null>(null);
  const [flowPaused, setFlowPaused] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const controller = startLinkFlowAnimation(el);
    linkFlowRef.current = controller;
    return () => {
      controller.stop();
      if (linkFlowRef.current === controller) {
        linkFlowRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    linkFlowRef.current?.setPaused(flowPaused);
  }, [flowPaused]);

  return { flowPaused, setFlowPaused };
}
