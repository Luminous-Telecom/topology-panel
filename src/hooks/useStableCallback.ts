import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Identidade fixa para um handler cuja implementação muda a cada render.
 *
 * Os handlers de nó (`onClick`, `onDoubleClick`, `onPointerDown`…) dependem de seleção, modo de
 * edição, layouts e do estado do arraste, então trocam de identidade a quase todo render do canvas.
 * Como eles descem como prop para cada forma memoizada, essa troca sozinha redesenhava os
 * quinhentos nós do mapa a cada refresh.
 *
 * A referência é atualizada no commit (`useLayoutEffect`), nunca durante o render — um render
 * descartado pelo React não deixa o handler apontando para um closure que não chegou a valer.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);

  useLayoutEffect(() => {
    latest.current = fn;
  }, [fn]);

  return useCallback((...args: A) => latest.current(...args), []);
}
