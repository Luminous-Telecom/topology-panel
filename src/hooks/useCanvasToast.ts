import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_MS = 3500;

/**
 * Aviso curto no rodapé do canvas. Aceita `undefined` porque várias ações (ex.: `runHostTool`)
 * resolvem sem mensagem — nesse caso nada aparece.
 */
export function useCanvasToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number>();

  const showToast = useCallback((message: string | undefined) => {
    if (!message) {
      return;
    }
    // Um timer por vez: sem cancelar o anterior, o toast novo herdava a contagem do antigo.
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    setToast(message);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      setToast(null);
    }, TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  return { toast, showToast };
}
