import { autoUpdate, flip, offset, shift, useFloating, type Placement } from '@floating-ui/react';
import { useLayoutEffect } from 'react';

interface Options {
  anchor: HTMLElement | null;
  enabled?: boolean;
  placement?: Placement;
  offsetPx?: number;
}

/** Tooltip/popover ancorado a um elemento (lista de alertas, chips NOC). */
export function useFloatingElementAnchor({
  anchor,
  enabled = true,
  placement = 'right-start',
  offsetPx = 8,
}: Options) {
  const { refs, floatingStyles, update } = useFloating({
    placement,
    strategy: 'absolute',
    middleware: [offset(offsetPx), flip({ padding: 8 }), shift({ padding: 8 })],
  });

  useLayoutEffect(() => {
    if (!enabled || !anchor) {
      return;
    }
    refs.setReference(anchor);
    const floating = refs.floating.current;
    if (!floating) {
      return;
    }
    return autoUpdate(anchor, floating, update);
  }, [anchor, enabled, refs, update]);

  return { refs, floatingStyles };
}
