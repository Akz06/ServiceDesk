import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error';

export interface Toast {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: ReactNode, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
