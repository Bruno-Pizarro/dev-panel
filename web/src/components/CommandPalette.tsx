import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { allNavItems } from '../lib/nav';
import { Kbd } from './Kbd';

/** Paleta de comandos (Ctrl/⌘ + K): ir a cualquier vista. Las acciones de cada fase se suman acá. */
export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-80 items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-accent/40"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Ir a…</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>
      <Command.Dialog open={open} onOpenChange={setOpen} label="Paleta de comandos" className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[18vh]">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <div className="relative w-full max-w-xl animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <Command.Input placeholder="Buscar una vista o acción…" className="h-14 w-full border-b border-line bg-transparent px-5 text-base outline-none placeholder:text-muted" />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-muted">Sin resultados.</Command.Empty>
            <Command.Group heading="Vistas" className="text-sm text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
              {allNavItems.map((item) => (
                <Command.Item
                  key={item.path}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => {
                    navigate(item.path);
                    setOpen(false);
                  }}
                  className="flex h-12 cursor-pointer items-center gap-3 rounded-lg px-3 text-fg data-[selected=true]:bg-accent/15 data-[selected=true]:text-accent"
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  <div className="leading-tight">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-sm text-muted">{item.description}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </div>
      </Command.Dialog>
    </>
  );
};
