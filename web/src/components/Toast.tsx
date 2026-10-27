import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const colors = { success: 'text-success', error: 'text-danger', info: 'text-info' };

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((item) => {
          const Icon = icons[item.kind];
          return (
            <div key={item.id} className="pointer-events-auto flex animate-fade-in items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 shadow-pop">
              <Icon className={cn('mt-0.5 size-5 shrink-0', colors[item.kind])} aria-hidden />
              <p className="text-sm">{item.message}</p>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
