import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Congela `value` (ex.: snapshot dos dados da Query) enquanto `isGestureActiveRef.current` for
 * `true` (arraste do mapa, da scrollbar, resize de nó, etc.) — evita que um auto-refresh do
 * dashboard troque cores/hosts/posições no meio do gesto, o que na prática aparecia como um
 * "pulo" no mapa. Ao soltar o ponteiro, o chamador deve invocar o `flush` retornado para aplicar
 * imediatamente o valor mais recente já recebido durante o gesto.
 */
export function useDeferredDuringGesture<T>(
  value: T,
  isGestureActiveRef: MutableRefObject<boolean>
): [T, () => void] {
  const [committed, setCommitted] = useState(value);
  const pendingRef = useRef(value);
  pendingRef.current = value;
  const committedRef = useRef(committed);
  committedRef.current = committed;

  useEffect(() => {
    if (isGestureActiveRef.current) {
      return;
    }
    if (Object.is(value, committedRef.current)) {
      return;
    }
    setCommitted(value);
  }, [value, isGestureActiveRef]);

  const flush = useCallback(() => {
    if (Object.is(pendingRef.current, committedRef.current)) {
      return;
    }
    setCommitted(pendingRef.current);
  }, []);

  return [committed, flush];
}
