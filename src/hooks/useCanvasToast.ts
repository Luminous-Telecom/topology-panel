import { useCallback, useState } from 'react';

const TOAST_MS = 3500;

/**
 * Aviso curto no rodapé do canvas. Aceita `undefined` porque várias ações (ex.: `runHostTool`)
 * resolvem sem mensagem — nesse caso nada aparece.
 */
export function useCanvasToast() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string | undefined) => {
    if (!message) {
      return;
    }
    setToast(message);
    window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  return { toast, showToast };
}
