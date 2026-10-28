import { Check, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { THEMES, useTheme } from '../lib/theme';
import { cn } from '../lib/cn';

export const ThemePicker = () => {
  const [theme, choose] = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', escape));
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="Cambiar el tema de colores" aria-expanded={open} title="Tema de colores" className="flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
        <Palette className="size-5" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-line bg-surface p-2 shadow-pop" role="listbox" aria-label="Temas">
          {THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={theme === option.id}
              onClick={() => (choose(option.id), setOpen(false))}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2', theme === option.id && 'bg-surface-2')}
            >
              <span className="flex h-6 w-12 shrink-0 overflow-hidden rounded-md border border-line" aria-hidden>
                {option.swatch.map((color) => <span key={color} className="flex-1" style={{ background: color }} />)}
              </span>
              <span className="flex-1 text-fg">{option.label}</span>
              {theme === option.id && <Check className="size-4 text-accent" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
