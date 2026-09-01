import { MutableRefObject, useCallback, useRef, useState } from 'react';

/**
 * Congela `value` (ex.: snapshot dos dados da Query) enquanto `isGestureActiveRef.current` for
 * `true` (arraste do mapa, da scrollbar, resize de nó, etc.) — evita que um auto-refresh do
 * dashboard troque cores/hosts/posições no meio do gesto, o que na prática aparecia como um
 * "pulo" no mapa. Ao soltar o ponteiro, o chamador deve invocar o `flush` retornado para aplicar
 * imediatamente o valor mais recente já recebido durante o gesto.
 *
 * Fora do gesto devolve `value` no mesmo render. Um `useEffect` + `setState` atrasava o lastvalue
 * para o commit seguinte e o React fazia um long-task extra no intervalo do Zabbix.
 */
export function useDeferredDuringGesture<T>(
  value: T,
  isGestureActiveRef: MutableRefObject<boolean>
): [T, () => void] {
  const frozenRef = useRef(value);
  const pendingRef = useRef(value);
  pendingRef.current = value;
  const [, setVersion] = useState(0);

  if (!isGestureActiveRef.current) {
    frozenRef.current = value;
  }

  const flush = useCallback(() => {
    const next = pendingRef.current;
    if (Object.is(next, frozenRef.current)) {
      return;
    }
    frozenRef.current = next;
    setVersion((n) => n + 1);
  }, []);

  return [isGestureActiveRef.current ? frozenRef.current : value, flush];
}
