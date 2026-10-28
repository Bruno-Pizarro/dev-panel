import { Camera, DatabaseBackup, KeyRound, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ConfirmModal } from '../components/ConfirmModal';
import { JobOutput } from '../components/JobOutput';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useJob } from '../lib/hooks';
import type { Snapshot, TestDataRow, TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'snapshots' | 'password' | 'remote' | 'testdata';
type Databases = Record<string, Array<{ name: string; count: number }>>;
const key = (db: string, collection: string) => `${db}.${collection}`;

const SnapshotsTab = () => {
  const toast = useToast();
  const collections = useAsync(() => api.get<{ databases: Databases }>('/api/data/collections'));
  const snapshots = useAsync(() => api.get<{ snapshots: Snapshot[] }>('/api/data/snapshots'));
  const { job, follow } = useJob();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [restoring, setRestoring] = useState<Snapshot | null>(null);
  const [restoreItems, setRestoreItems] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return Object.entries(collections.data?.databases ?? {})
      .map(([db, list]) => ({ db, list: list.filter((item) => !text || `${db}.${item.name}`.toLowerCase().includes(text)) }))
      .filter((entry) => entry.list.length > 0);
  }, [collections.data, query]);

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleDb = (db: string, list: Array<{ name: string }>) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = list.every((item) => next.has(key(db, item.name)));
      list.forEach((item) => (all ? next.delete(key(db, item.name)) : next.add(key(db, item.name))));
      return next;
    });

  const run = async (action: () => Promise<{ jobId: string } | unknown>, onDone?: () => void) => {
    setBusy(true);
    try {
      const result = (await action()) as { jobId?: string };
      if (result?.jobId) follow(result.jobId);
      onDone?.();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createSnapshot = () =>
    run(() => api.post('/api/data/snapshots', { label, items: [...selected].map((id) => { const [db, ...rest] = id.split('.'); return { db, collection: rest.join('.') }; }) }), () => { setLabel(''); window.setTimeout(snapshots.reload, 2500); });

  const restore = () =>
    run(
      () => api.post(`/api/data/snapshots/${encodeURIComponent(restoring!.id)}/restore`, { confirm: true, items: restoring!.items.filter((item) => restoreItems.has(key(item.db, item.collection))).map((item) => ({ db: item.db, collection: item.collection })) }),
      () => setRestoring(null),
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card title="Qué respaldar" action={<span className="text-sm text-muted">{selected.size} seleccionadas</span>}>
          <label className="mb-4 flex h-10 items-center gap-2 rounded-lg border border-line bg-bg px-3 focus-within:border-accent/60">
            <Search className="size-4 text-muted" aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar bases y colecciones…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          </label>
          {collections.loading ? <Skeleton className="h-48" /> : collections.error ? <p className="text-danger">{collections.error}</p> : (
            <div className="max-h-[28rem] space-y-5 overflow-y-auto pr-1">
              {visible.map(({ db, list }) => (
                <div key={db}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono font-medium">{db}</span>
                    <button type="button" onClick={() => toggleDb(db, list)} className="text-sm text-accent hover:underline">{list.every((item) => selected.has(key(db, item.name))) ? 'Quitar todas' : 'Seleccionar todas'}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((item) => <Chip key={item.name} selected={selected.has(key(db, item.name))} onToggle={() => toggle(key(db, item.name))}>{item.name} <span className="text-muted">{item.count}</span></Chip>)}
                  </div>
                </div>
              ))}
              {visible.length === 0 && <p className="py-6 text-center text-muted">Sin coincidencias.</p>}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Etiqueta (opcional)" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60" />
            <Button variant="primary" icon={<Camera className="size-4" />} disabled={selected.size === 0} loading={busy} onClick={createSnapshot}>Crear snapshot</Button>
          </div>
        </Card>
        <JobOutput job={job} />
      </div>

      <Card title="Snapshots guardados">
        {snapshots.loading ? <Skeleton className="h-40" /> : (snapshots.data?.snapshots ?? []).length === 0 ? <p className="text-muted">Todavía no hay snapshots.</p> : (
          <ul className="space-y-3">
            {snapshots.data!.snapshots.map((snapshot) => (
              <li key={snapshot.id} className="rounded-xl border border-line bg-surface-2 p-3.5">
                <div className="font-medium">{snapshot.label || 'Sin etiqueta'}</div>
                <div className="mt-0.5 font-mono text-sm text-muted">{new Date(snapshot.createdAt).toLocaleString('es-AR')}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">{snapshot.items.map((item) => <span key={key(item.db, item.collection)} className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-sm text-muted">{item.db}.{item.collection} · {item.count}</span>)}</div>
                <div className="mt-3 flex gap-2">
                  <Button className="h-9" icon={<RotateCcw className="size-4" />} onClick={() => { setRestoring(snapshot); setRestoreItems(new Set(snapshot.items.map((item) => key(item.db, item.collection)))); }}>Restaurar…</Button>
                  <Button className="h-9" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(snapshot)}>Borrar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal open={restoring !== null} title="Restaurar snapshot" confirmLabel="Restaurar" danger loading={busy} onCancel={() => setRestoring(null)} onConfirm={restore}>
        <p className="mb-3">Se <strong className="text-fg">reemplaza</strong> el contenido actual de las colecciones elegidas por el del snapshot, y se verifica el conteo al terminar.</p>
        <div className="flex flex-wrap gap-2">
          {restoring?.items.map((item) => <Chip key={key(item.db, item.collection)} selected={restoreItems.has(key(item.db, item.collection))} onToggle={() => setRestoreItems((current) => { const next = new Set(current); const id = key(item.db, item.collection); if (next.has(id)) next.delete(id); else next.add(id); return next; })}>{item.db}.{item.collection}</Chip>)}
        </div>
      </ConfirmModal>
      <ConfirmModal open={deleting !== null} title="Borrar snapshot" confirmLabel="Borrar" danger loading={busy} onCancel={() => setDeleting(null)} onConfirm={() => run(async () => { await api.del(`/api/data/snapshots/${encodeURIComponent(deleting!.id)}`); snapshots.reload(); setDeleting(null); })}>
        Se borra el respaldo <span className="text-fg">{deleting?.label || deleting?.id}</span> de este equipo. No se puede deshacer.
      </ConfirmModal>
    </div>
  );
};

const PasswordTab = () => {
  const toast = useToast();
  const { job, follow } = useJob();
  const [email, setEmail] = useState('');
  const [rows, setRows] = useState<Array<{ db: string; usersInDb: number; matches: number }> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setBusy(true);
    try {
      setRows((await api.post<{ rows: Array<{ db: string; usersInDb: number; matches: number }> }>('/api/data/password/preview', { email })).rows);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    try {
      follow((await api.post<{ jobId: string }>('/api/data/password/reset', { email, confirm: true })).jobId);
      setConfirming(false);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const found = rows?.filter((row) => row.matches > 0).length ?? 0;

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Contraseña del superadmin local en un mail">
        <p className="mb-4 text-muted">Copia el hash de contraseña del superadmin local al mail que indiques, en <strong className="text-fg">todas</strong> las bases donde ese mail exista (no solo en dos).</p>
        <div className="flex gap-2">
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3.5 font-mono text-sm outline-none placeholder:text-muted focus:border-accent/60" />
          <Button icon={<Search className="size-4" />} loading={busy} disabled={!email} onClick={preview}>Ver dónde está</Button>
        </div>
        {rows && (
          <div className="mt-4">
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="pb-2 font-medium">Base</th><th className="pb-2 font-medium">Usuarios</th><th className="pb-2 font-medium">Con ese mail</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => <tr key={row.db} className={cn(row.matches === 0 && 'text-muted')}><td className="py-2 font-mono">{row.db}</td><td className="py-2">{row.usersInDb}</td><td className="py-2">{row.matches}</td></tr>)}
              </tbody>
            </table>
            <Button className="mt-4" variant="danger" icon={<KeyRound className="size-4" />} disabled={found === 0} onClick={() => setConfirming(true)}>Resetear en {found} {found === 1 ? 'base' : 'bases'}</Button>
          </div>
        )}
      </Card>
      <JobOutput job={job} />
      <ConfirmModal open={confirming} title="Resetear contraseña" confirmLabel="Resetear" danger loading={busy} onCancel={() => setConfirming(false)} onConfirm={reset}>
        Se cambia la contraseña de <span className="font-mono text-fg">{email}</span> en {found} bases del Mongo local. El hash del superadmin nunca se muestra.
      </ConfirmModal>
    </div>
  );
};

const RemoteTab = () => {
  const toast = useToast();
  const { job, follow } = useJob();
  const options = useAsync(() => api.get<{ types: string[]; scriptsDir: string; scriptsDirExists: boolean; scripts: string[]; selected: string; selectedExists: boolean }>('/api/data/remote-backup/options'));
  const [script, setScript] = useState<string | null>(null);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [restore, setRestore] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      follow((await api.post<{ jobId: string }>('/api/data/remote-backup', { types: [...types], restore, dryRun, confirm: true, ...(script ? { script } : {}) })).jobId);
      setConfirming(false);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (type: string) => setTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; });

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Backup remoto">
        <p className="mb-3 text-muted">Ejecuta un script de tu carpeta de scripts: baja los backups por SFTP y, si lo pedís, los restaura en el Mongo local.</p>
        {options.data && (
          <div className="mb-4 rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm">
            <div className="text-muted">Carpeta de scripts: <span className="font-mono text-fg">{options.data.scriptsDir}</span>{!options.data.scriptsDirExists && <span className="ml-2 text-warning">no existe, cambiala en Configuración</span>}</div>
            {options.data.scripts.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-muted">Script:</span>{options.data.scripts.map((name) => <Chip key={name} selected={(script ?? options.data!.selected) === name} onToggle={() => setScript(name)}>{name}</Chip>)}</div>
            ) : options.data.scriptsDirExists && <div className="mt-1 text-warning">No hay archivos .sh en esa carpeta.</div>}
            {options.data.scripts.length > 0 && !options.data.selectedExists && !script && <div className="mt-1 text-warning">El script configurado ({options.data.selected}) no está en la carpeta: elegí uno.</div>}
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip selected={types.has('all')} onToggle={() => toggle('all')}>all</Chip>
          {(options.data?.types ?? []).map((type) => <Chip key={type} selected={types.has(type)} onToggle={() => toggle(type)}>{type}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip selected={restore} onToggle={() => setRestore(!restore)} hint="Restaura en el Mongo local">Restaurar en Mongo local</Chip>
          <Chip selected={dryRun} onToggle={() => setDryRun(!dryRun)} hint="No descarga ni restaura nada: solo muestra qué haría">Solo simular (dry-run)</Chip>
        </div>
        <Button className="mt-5" variant={dryRun ? 'primary' : 'danger'} icon={<DatabaseBackup className="size-4" />} disabled={types.size === 0} loading={busy} onClick={() => (dryRun ? start() : setConfirming(true))}>{dryRun ? 'Simular' : 'Ejecutar'}</Button>
        <p className="mt-3 text-sm text-warning">Sin probar contra el servidor real: empezá siempre con "Solo simular".</p>
      </Card>
      <JobOutput job={job} />
      <ConfirmModal open={confirming} title="Ejecutar backup remoto" confirmLabel="Ejecutar" danger loading={busy} onCancel={() => setConfirming(false)} onConfirm={start}>
        Se va a descargar {[...types].join(', ')}{restore ? ' y restaurar en el Mongo local, reemplazando esas bases' : ''}.
      </ConfirmModal>
    </div>
  );
};

const TestDataTab = () => {
  const toast = useToast();
  const { job, follow } = useJob();
  const tickets = useAsync(() => api.get<{ tickets: TicketSummary[] }>('/api/tickets'));
  const [ticket, setTicket] = useState('');
  const [rows, setRows] = useState<TestDataRow[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const suggestions = (tickets.data?.tickets ?? []).filter((item) => item.ticket).slice(0, 8);
  const total = rows?.reduce((sum, row) => sum + row.count, 0) ?? 0;

  const search = async (value = ticket) => {
    setBusy(true);
    try {
      setTicket(value);
      setRows((await api.get<{ rows: TestDataRow[] }>(`/api/testdata?ticket=${encodeURIComponent(value)}`)).rows);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const clean = async () => {
    setBusy(true);
    try {
      follow((await api.post<{ jobId: string }>('/api/testdata/clean', { ticket, confirm: true })).jobId);
      setConfirming(false);
      window.setTimeout(() => void search(ticket), 4000);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Datos de prueba por ticket">
        <p className="mb-4 text-muted">Busca los documentos cuyo nombre empieza con <span className="font-mono text-fg">[número de ticket]</span> en las colecciones configuradas. Al limpiar, primero se exporta lo que se borra.</p>
        <div className="flex gap-2">
          <input value={ticket} onChange={(event) => setTicket(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => event.key === 'Enter' && search()} placeholder="Número de ticket, ej. 33526" className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3.5 font-mono text-sm outline-none placeholder:text-muted focus:border-accent/60" />
          <Button icon={<Search className="size-4" />} loading={busy} disabled={ticket.length < 3} onClick={() => search()}>Buscar</Button>
        </div>
        {suggestions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{suggestions.map((item) => <Chip key={item.dir} onToggle={() => search(item.ticket!)}>#{item.ticket}</Chip>)}</div>}
        {rows && (
          <div className="mt-5">
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="pb-2 font-medium">Colección</th><th className="pb-2 font-medium">Campo</th><th className="pb-2 text-right font-medium">Documentos</th></tr></thead>
              <tbody className="divide-y divide-line">{rows.map((row) => <tr key={`${row.db}.${row.collection}`} className={cn(row.count === 0 && 'text-muted')}><td className="py-2 font-mono">{row.db}.{row.collection}</td><td className="py-2 font-mono">{row.field}</td><td className="py-2 text-right">{row.count}</td></tr>)}</tbody>
            </table>
            <p className="mt-3 text-sm text-muted">No incluye archivos subidos (PDF en uploads de firma ni objetos en S3/MinIO).</p>
            <Button className="mt-4" variant="danger" icon={<Trash2 className="size-4" />} disabled={total === 0} onClick={() => setConfirming(true)}>Limpiar {total} documentos</Button>
          </div>
        )}
      </Card>
      <JobOutput job={job} />
      <ConfirmModal open={confirming} title="Limpiar datos de prueba" confirmLabel="Exportar y borrar" danger loading={busy} onCancel={() => setConfirming(false)} onConfirm={clean}>
        Se exportan y se borran {total} documentos marcados con <span className="font-mono text-fg">[{ticket}]</span>. El respaldo queda en la carpeta data del panel.
      </ConfirmModal>
    </div>
  );
};

export const Data = () => {
  const [tab, setTab] = useState<Tab>('password');
  return (
    <>
      <PageHeader title="Datos" description="Scripts usuales y datos del entorno local." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'password', label: 'Contraseña' }, { id: 'remote', label: 'Backup remoto' }, { id: 'testdata', label: 'Datos de prueba' }, { id: 'snapshots', label: 'Snapshots' }]} />
      {tab === 'snapshots' && <SnapshotsTab />}
      {tab === 'password' && <PasswordTab />}
      {tab === 'remote' && <RemoteTab />}
      {tab === 'testdata' && <TestDataTab />}
    </>
  );
};
