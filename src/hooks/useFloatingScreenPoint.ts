import { autoUpdate, flip, offset, shift, useFloating, type Placement } from '@floating-ui/react';
import { useLayoutEffect, useMemo } from 'react';

interface Options {
  x: number;
  y: number;
  placement?: Placement;
  offsetPx?: number;
  enabled?: boolean;
}

/**
 * Posiciona overlay fixo ao lado de um ponto de tela (hover de cabo/host, menu de contexto).
 * Substitui clamp manual — flip/shift mantêm o painel visível em tela cheia e com zoom.
 */
export function useFloatingScreenPoint({
  x,
  y,
  placement = 'right-start',
  offsetPx = 12,
  enabled = true,
}: Options) {
  const virtualReference = useMemo(
    () => ({
      getBoundingClientRect: () =>
        DOMRect.fromRect({
          x,
          y,
          width: 0,
          height: 0,
        }),
    }),
    [x, y]
  );

  const { refs, floatingStyles, update } = useFloating({
    placement,
    strategy: 'fixed',
    middleware: [offset(offsetPx), flip({ padding: 8 }), shift({ padding: 8 })],
  });

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    refs.setReference(virtualReference);
    const floating = refs.floating.current;
    if (!floating) {
      return;
    }
    return autoUpdate(virtualReference, floating, update);
  }, [enabled, refs, update, virtualReference]);

  return { refs, floatingStyles };
}
