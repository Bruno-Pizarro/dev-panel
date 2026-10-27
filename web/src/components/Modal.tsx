import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { Portal } from './Portal';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** `screen`: ocupa casi toda la ventana (logs); un clic fuera del panel lo cierra en todos los tamaños. */
  size?: 'md' | 'xl' | 'screen';
}

const sizes = { md: 'max-w-lg', xl: 'max-w-5xl', screen: 'h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)]' };

export const Modal = ({ open, title, onClose, children, footer, size = 'md' }: ModalProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className={cn('relative flex w-full animate-fade-in flex-col rounded-2xl border border-line bg-surface shadow-pop', sizes[size])}>
          <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button variant="ghost" className="size-9 !px-0" onClick={onClose} aria-label="Cerrar" icon={<X className="size-5" />} />
          </header>
          <div className={cn('min-h-0 p-5', size === 'screen' && 'flex flex-1 flex-col')}>{children}</div>
          {footer && <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
        </div>
      </div>
    </Portal>
  );
};
