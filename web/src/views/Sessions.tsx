import { Copy, LogIn, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import type { ActiveSession, MintedSession, SessionUser } from '../lib/types';
import { useAsync } from '../lib/useAsync';

/** Script que siembra los tokens en el front: se pega en la consola del navegador estando en el front. */
const seedScript = (session: MintedSession): string =>
  `localStorage.setItem('accessToken', ${JSON.stringify(session.accessToken)}); localStorage.setItem('refreshToken', ${JSON.stringify(session.refreshToken)}); location.href = '/';`;

export const Sessions = () => {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [target, setTarget] = useState<SessionUser | null>(null);
  const [minted, setMinted] = useState<MintedSession | null>(null);
  const [revoking, setRevoking] = useState<string | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useAsync(() => api.get<{ sessions: ActiveSession[] }>('/api/session/active'));

  useEffect(() => {
    if (query.trim().length < 2) return setUsers([]);
    const timer = window.setTimeout(() => api.get<{ users: SessionUser[] }>(`/api/session/users?q=${encodeURIComponent(query)}`).then((result) => setUsers(result.users), (error: Error) => toast('error', error.message)), 300);
    return () => window.clearTimeout(timer);
  }, [query, toast]);

  const enter = async () => {
    if (!target) return;
    setBusy(true);
    try {
      setMinted(await api.post<MintedSession>('/api/session/token', { userId: target.id, confirm: true }));
      setTarget(null);
      active.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ deleted: number }>('/api/session/revoke', { confirm: true, ...(revoking && revoking !== 'all' ? { id: revoking } : {}) });
      toast('success', `${result.deleted} sesiones cerradas.`);
      setRevoking(null);
      active.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyScript = useCallback(async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(seedScript(minted));
      toast('success', 'Script copiado. Pegalo en la consola del front.');
    } catch {
      toast('error', 'No se pudo copiar.');
    }
  }, [minted, toast]);

  return (
    <>
      <PageHeader title="Sesiones de prueba" description="Entrá al front como cualquier usuario del entorno local, sin su contraseña." />
      <p className="mb-5 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        Firma un token con el JWT_SECRET de <span className="font-mono">security</span> y lo registra en la base local. Funciona solo en este entorno; las sesiones que cree el panel se pueden cerrar desde acá.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Buscar usuario">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-bg px-3 focus-within:border-accent/60">
            <Search className="size-4 text-muted" aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mail o nombre (mínimo 2 letras)…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          </label>
          <ul className="mt-4 divide-y divide-line">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{user.name || user.email}</div>
                  <div className="truncate font-mono text-sm text-muted">{user.email}{user.role ? ` · ${user.role}` : ''}</div>
                </div>
                <Button className="h-9 shrink-0" icon={<LogIn className="size-4" />} onClick={() => setTarget(user)}>Entrar</Button>
              </li>
            ))}
            {query.trim().length >= 2 && users.length === 0 && <li className="py-6 text-center text-muted">Sin resultados.</li>}
          </ul>
        </Card>

        <Card title="Sesiones creadas por el panel" action={(active.data?.sessions.length ?? 0) > 0 && <Button className="h-9" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setRevoking('all')}>Cerrar todas</Button>}>
          {(active.data?.sessions ?? []).length === 0 ? <p className="text-muted">No hay sesiones abiertas por el panel.</p> : (
            <ul className="divide-y divide-line">
              {active.data!.sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm">{session.email}</div>
                    <div className="text-sm text-muted">vence {new Date(session.expiresAt).toLocaleString('es-AR')}</div>
                  </div>
                  <Button className="h-9 shrink-0" onClick={() => setRevoking(session.id)}>Cerrar</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmModal open={target !== null} title="Entrar como este usuario" confirmLabel="Crear sesión" loading={busy} onCancel={() => setTarget(null)} onConfirm={enter}>
        Se crea una sesión de prueba para <span className="font-mono text-fg">{target?.email}</span>.
      </ConfirmModal>
      <ConfirmModal open={revoking !== null} title="Cerrar sesiones" confirmLabel="Cerrar" danger loading={busy} onCancel={() => setRevoking(null)} onConfirm={revoke}>
        Se borran de la base local los tokens que creó el panel{revoking === 'all' ? '' : ' para esta sesión'}. Las demás sesiones de ese usuario no se tocan.
      </ConfirmModal>
      <Modal open={minted !== null} title="Sesión lista" onClose={() => setMinted(null)} size="xl" footer={<Button onClick={() => setMinted(null)}>Cerrar</Button>}>
        {minted && (
          <div className="space-y-4">
            <p>Sesión de <span className="font-mono text-fg">{minted.user.email}</span>. Vence {new Date(minted.expiresAt).toLocaleString('es-AR')}.</p>
            <ol className="list-decimal space-y-2 pl-5 text-muted">
              <li>Abrí el front en una pestaña: <a className="text-accent hover:underline" href={minted.frontUrl} target="_blank" rel="noreferrer noopener">{minted.frontUrl}</a></li>
              <li>Abrí las herramientas de desarrollo (F12) → Consola.</li>
              <li>Pegá el script y apretá Enter: te deja logueado y te lleva al inicio.</li>
            </ol>
            <div className="relative">
              <pre className="max-h-40 overflow-auto rounded-xl border border-line bg-bg p-4 pr-28 font-mono text-sm leading-6 break-all whitespace-pre-wrap">{seedScript(minted).slice(0, 160)}…</pre>
              <Button className="absolute right-3 top-3 h-9" variant="primary" icon={<Copy className="size-4" />} onClick={copyScript}>Copiar script</Button>
            </div>
            <p className="text-sm text-muted">Los tokens no se guardan en el navegador del panel. Cerrá la sesión desde esta pantalla cuando termines.</p>
          </div>
        )}
      </Modal>
    </>
  );
};
