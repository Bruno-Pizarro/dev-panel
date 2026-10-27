import { Outlet } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { StatusDot } from './StatusDot';
import { useHealth } from '../lib/useHealth';

export const Layout = () => {
  const health = useHealth();
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/60 px-8 backdrop-blur">
          <CommandPalette />
          <StatusDot status={health === 'ok' ? 'ok' : health === 'down' ? 'error' : 'busy'} label={health === 'ok' ? 'Servidor conectado' : health === 'down' ? 'Servidor sin respuesta' : 'Conectando…'} />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-6xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
