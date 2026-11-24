import { ChevronDown, ChevronLeft, ChevronRight, Copy, Database, Eraser, Search, Table2, Braces } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { cellText, columnsOf, formatBytes, idFilter, prettyJson, type ExplorerPage, type SchemaField } from '../lib/mongoDisplay';
import { pickTab, withParam } from '../lib/urlState';
import { useAsync } from '../lib/useAsync';

type Tab = 'documentos' | 'indices' | 'esquema';
const TABS = ['documentos', 'indices', 'esquema'] as const;
type CollectionInfo = { name: string; count: number };
/** Lo que se sabe de las colecciones de una base: se pide recién cuando esa base se expande. */
type Loaded = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; collections: CollectionInfo[] };
const LIMITS = [10, 25, 50, 100];

const inputClass = 'h-10 w-full rounded-lg border border-line bg-surface-2 px-3 font-mono text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none';

const query = (params: Record<string, string | number | undefined>): string =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');

// ---------------------------------------------------------------- documentos

interface Applied { filter: string; sort: string; fields: string; limit: number; skip: number }
type Apply = (next: Partial<{ f: string; ord: string; cam: string; lim: number; skip: number }>) => void;
type Mode = 'tabla' | 'json';

/** Los resultados de UNA consulta: se vuelve a montar (y a cargar) cada vez que cambia la consulta, por su `key`. */
const Results = ({ db, collection, applied, mode, apply, onOpen }: { db: string; collection: string; applied: Applied; mode: Mode; apply: Apply; onOpen: (document: Record<string, unknown>) => void }) => {
  const page = useAsync(() => api.get<ExplorerPage>(`/api/explorer/documents?${query({ db, collection, filter: applied.filter, sort: applied.sort, fields: applied.fields, limit: applied.limit, skip: applied.skip })}`));
  const documents = useMemo(() => page.data?.documents ?? [], [page.data]);
  const columns = useMemo(() => columnsOf(documents), [documents]);
  const from = documents.length ? applied.skip + 1 : 0;
  const to = applied.skip + documents.length;
  const filtered = !!(applied.filter || applied.sort || applied.fields);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {page.data && <span>{documents.length ? `${from}–${to}` : 'Sin resultados'}{page.data.hasMore ? ' (hay más)' : ''} · {page.data.total.toLocaleString('es-AR')} documentos en la colección</span>}
          {page.data?.masked && <Badge tone="info" title="Los campos password, token, secret, hash y similares se muestran tapados">Secretos tapados</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<ChevronLeft className="size-4" />} disabled={applied.skip === 0} onClick={() => apply({ skip: Math.max(0, applied.skip - applied.limit) })}>Anterior</Button>
          <Button disabled={!page.data?.hasMore} onClick={() => apply({ skip: applied.skip + applied.limit })}>Siguiente<ChevronRight className="size-4" /></Button>
        </div>
      </div>

      {page.error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" data-testid="explorer-error">{page.error}</p>}
      {page.loading && !page.data && !page.error ? (
        <Skeleton className="h-64" />
      ) : page.data && documents.length === 0 ? (
        <EmptyState icon={<Database className="size-6" />} title="Sin documentos">{filtered ? 'Ningún documento cumple el filtro.' : 'La colección está vacía.'}</EmptyState>
      ) : mode === 'tabla' ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">{column}</th>)}</tr>
            </thead>
            <tbody>
              {documents.map((document, index) => (
                <tr key={index} className="cursor-pointer border-t border-line hover:bg-surface-2/60" onClick={() => onOpen(document)} data-testid="explorer-row">
                  {columns.map((column) => <td key={column} className="max-w-[22rem] truncate whitespace-nowrap px-3 py-2 font-mono">{cellText(document[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document, index) => (
            <pre key={index} className="cursor-pointer overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-sm hover:border-accent/50" onClick={() => onOpen(document)}>{prettyJson(document)}</pre>
          ))}
        </div>
      )}
    </>
  );
};

const DocumentsTab = ({ db, collection }: { db: string; collection: string }) => {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const applied: Applied = { filter: params.get('f') ?? '', sort: params.get('ord') ?? '', fields: params.get('cam') ?? '', limit: Number(params.get('lim')) || 25, skip: Number(params.get('skip')) || 0 };
  const [form, setForm] = useState({ filter: applied.filter, sort: applied.sort, fields: applied.fields, id: '' });
  const [mode, setMode] = useState<Mode>('tabla');
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);

  const apply: Apply = (next) =>
    setParams((previous) => {
      let result = new URLSearchParams(previous);
      for (const [name, value] of Object.entries(next)) result = withParam(result, name, value === undefined || value === '' || (name === 'skip' && value === 0) || (name === 'lim' && value === 25) ? null : String(value));
      return result;
    });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const filter = form.id.trim() ? idFilter(form.id) : form.filter.trim();
    apply({ f: filter, ord: form.sort.trim(), cam: form.fields.trim(), skip: 0 });
  };
  const clear = () => {
    setForm({ filter: '', sort: '', fields: '', id: '' });
    apply({ f: '', ord: '', cam: '', skip: 0 });
  };
  const filtered = !!(applied.filter || applied.sort || applied.fields);
  const queryKey = `${db}|${collection}|${applied.filter}|${applied.sort}|${applied.fields}|${applied.limit}|${applied.skip}`;

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr]">
          <label className="block text-sm text-muted">Filtro (JSON)
            <input className={cn(inputClass, 'mt-1')} placeholder='{ "nroLegajo": 1106733 }' value={form.filter} onChange={(event) => setForm({ ...form, filter: event.target.value, id: '' })} spellCheck={false} />
          </label>
          <label className="block text-sm text-muted">Orden (JSON)
            <input className={cn(inputClass, 'mt-1')} placeholder='{ "createdAt": -1 }' value={form.sort} onChange={(event) => setForm({ ...form, sort: event.target.value })} spellCheck={false} />
          </label>
          <label className="block text-sm text-muted">Campos a mostrar
            <input className={cn(inputClass, 'mt-1')} placeholder="nombre, email, createdAt" value={form.fields} onChange={(event) => setForm({ ...form, fields: event.target.value })} spellCheck={false} />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-sm text-muted">Buscar por _id
            <input className={cn(inputClass, 'mt-1')} placeholder="6980f46cb4a8e1644fb9e569" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} spellCheck={false} />
          </label>
          <label className="block text-sm text-muted">Por página
            <select className={cn(inputClass, 'mt-1 w-28 font-sans')} value={applied.limit} onChange={(event) => apply({ lim: Number(event.target.value), skip: 0 })}>
              {LIMITS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Vista">
            <button type="button" onClick={() => setMode('tabla')} className={cn('flex h-10 items-center gap-2 px-3 text-sm', mode === 'tabla' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2')}><Table2 className="size-4" />Tabla</button>
            <button type="button" onClick={() => setMode('json')} className={cn('flex h-10 items-center gap-2 px-3 text-sm', mode === 'json' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2')}><Braces className="size-4" />JSON</button>
          </div>
          <Button type="submit" variant="primary" icon={<Search className="size-4" />}>Buscar</Button>
          {filtered && <Button type="button" icon={<Eraser className="size-4" />} onClick={clear}>Limpiar</Button>}
        </div>
      </form>

      <Results key={queryKey} db={db} collection={collection} applied={applied} mode={mode} apply={apply} onOpen={setOpen} />

      <Modal open={open !== null} title={open ? `Documento · ${cellText(open['_id'], 40)}` : ''} onClose={() => setOpen(null)} size="xl" footer={open && <Button icon={<Copy className="size-4" />} onClick={() => void navigator.clipboard.writeText(prettyJson(open)).then(() => toast('success', 'Documento copiado'))}>Copiar JSON</Button>}>
        {open && <pre className="max-h-[65vh] overflow-auto rounded-lg bg-surface-2 p-4 font-mono text-sm" data-testid="explorer-detail">{prettyJson(open)}</pre>}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------- índices

interface IndexInfo {
  indexes: Array<{ name: string; key: Record<string, number | string>; unique?: boolean; sparse?: boolean; expireAfterSeconds?: number; partialFilterExpression?: unknown }>;
  stats: { count: number; size: number; storageSize: number; avgObjSize: number };
}

const IndexesTab = ({ db, collection }: { db: string; collection: string }) => {
  const info = useAsync(() => api.get<IndexInfo>(`/api/explorer/indexes?${query({ db, collection })}`));
  if (info.error) return <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{info.error}</p>;
  if (!info.data) return <Skeleton className="h-40" />;
  const { stats, indexes } = info.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[['Documentos', stats.count.toLocaleString('es-AR')], ['Tamaño de datos', formatBytes(stats.size)], ['En disco', formatBytes(stats.storageSize)], ['Promedio por documento', formatBytes(stats.avgObjSize)]].map(([label, value]) => (
          <Card key={label}><p className="text-sm text-muted">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-muted"><tr><th className="px-3 py-2 font-medium">Nombre</th><th className="px-3 py-2 font-medium">Campos</th><th className="px-3 py-2 font-medium">Propiedades</th></tr></thead>
          <tbody>
            {indexes.map((index) => (
              <tr key={index.name} className="border-t border-line align-top">
                <td className="px-3 py-2 font-mono">{index.name}</td>
                <td className="px-3 py-2 font-mono">{Object.entries(index.key).map(([field, direction]) => `${field}: ${direction}`).join(', ')}</td>
                <td className="flex flex-wrap gap-2 px-3 py-2">
                  {index.unique && <Badge tone="warning">único</Badge>}
                  {index.sparse && <Badge>sparse</Badge>}
                  {index.expireAfterSeconds !== undefined && <Badge tone="info">vence en {index.expireAfterSeconds} s</Badge>}
                  {index.partialFilterExpression !== undefined && <Badge tone="accent" title={JSON.stringify(index.partialFilterExpression)}>parcial</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- esquema

interface SchemaInfo {
  sampled: number;
  fields: SchemaField[];
  truncated: boolean;
}

const SchemaTab = ({ db, collection }: { db: string; collection: string }) => {
  const schema = useAsync(() => api.get<SchemaInfo>(`/api/explorer/schema?${query({ db, collection })}`));
  if (schema.error) return <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{schema.error}</p>;
  if (!schema.data) return <Skeleton className="h-40" />;
  const { sampled, fields, truncated } = schema.data;
  if (sampled === 0) return <EmptyState icon={<Database className="size-6" />} title="Sin documentos">No hay nada para analizar.</EmptyState>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Resumen de los primeros {sampled} documentos: qué campos aparecen, de qué tipo y en cuántos.{truncated ? ' Se muestran los primeros 300 campos.' : ''}</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-muted"><tr><th className="px-3 py-2 font-medium">Campo</th><th className="px-3 py-2 font-medium">Tipos</th><th className="px-3 py-2 font-medium">Presente en</th></tr></thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.path} className="border-t border-line">
                <td className="px-3 py-2 font-mono">{field.path}</td>
                <td className="flex flex-wrap gap-2 px-3 py-2">{Object.entries(field.types).map(([type, count]) => <Badge key={type} tone={type === 'null' ? 'warning' : 'neutral'}>{type}{Object.keys(field.types).length > 1 ? ` · ${count}` : ''}</Badge>)}</td>
                <td className="px-3 py-2">{field.presence} de {sampled} <span className="text-muted">({Math.round((field.presence / sampled) * 100)} %)</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- vista

export const Explorer = () => {
  const [params, setParams] = useSearchParams();
  const databases = useAsync(() => api.get<{ databases: string[] }>('/api/explorer/databases'));
  const [text, setText] = useState('');
  const db = params.get('db') ?? '';
  const collection = params.get('col') ?? '';
  const tab = pickTab(params.get('tab'), TABS, 'documentos') as Tab;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(db ? [db] : []));
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});

  /** Pide las colecciones (con su conteo) de UNA base. Si ya se pidieron, no vuelve a pedirlas. */
  const requested = useRef(new Set<string>());
  const loadCollections = useCallback((name: string) => {
    if (requested.current.has(name)) return;
    requested.current.add(name);
    setLoaded((current) => ({ ...current, [name]: { status: 'loading' } }));
    void api.get<{ collections: CollectionInfo[] }>(`/api/explorer/collections?db=${encodeURIComponent(name)}`).then(
      (result) => setLoaded((latest) => ({ ...latest, [name]: { status: 'ready', collections: result.collections } })),
      (error: Error) => {
        requested.current.delete(name); // un error se puede reintentar al volver a expandir
        setLoaded((latest) => ({ ...latest, [name]: { status: 'error', message: error.message } }));
      },
    );
  }, []);

  // La base de la URL (por ejemplo al recargar) se abre sola, y solo esa.
  useEffect(() => {
    if (db) loadCollections(db);
  }, [db, loadCollections]);

  const toggle = (name: string) => {
    const open = expanded.has(name);
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.delete(name);
      else next.add(name);
      return next;
    });
    if (!open) loadCollections(name);
  };

  const choose = (nextDb: string, nextCollection: string) =>
    setParams(() => {
      const next = new URLSearchParams();
      next.set('db', nextDb);
      next.set('col', nextCollection);
      return next;
    });

  const needle = text.trim().toLowerCase();
  // El buscador filtra por nombre de base y, en las bases ya abiertas, por colección. No abre bases ni pide nada.
  const visible = useMemo(
    () =>
      (databases.data?.databases ?? [])
        .map((name) => {
          const info = loaded[name];
          const collections = info?.status === 'ready' ? info.collections.filter((item) => !needle || `${name}.${item.name}`.toLowerCase().includes(needle)) : [];
          const matchesName = !needle || name.toLowerCase().includes(needle);
          return { name, collections, show: matchesName || collections.length > 0, forced: !matchesName && collections.length > 0 };
        })
        .filter((entry) => entry.show),
    [databases.data, loaded, needle],
  );

  const currentInfo = loaded[db];
  const current = currentInfo?.status === 'ready' ? currentInfo.collections.find((item) => item.name === collection) : undefined;

  return (
    <div>
      <PageHeader title="Explorador de bases" description="Mirá los datos del Mongo local por colección. Es solo lectura: no se puede escribir ni borrar nada desde acá." />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-3">
          <input className={cn(inputClass, 'font-sans')} placeholder="Buscar base o colección…" value={text} onChange={(event) => setText(event.target.value)} />
          {databases.error && <p className="text-sm text-danger">{databases.error}</p>}
          {databases.loading && !databases.data ? (
            <Skeleton className="h-64" />
          ) : (
            <nav className="max-h-[70vh] space-y-1 overflow-y-auto pr-1" aria-label="Bases y colecciones">
              {visible.map((entry) => {
                const open = expanded.has(entry.name) || entry.forced;
                const info = loaded[entry.name];
                return (
                  <div key={entry.name}>
                    <button type="button" onClick={() => toggle(entry.name)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold hover:bg-surface-2">
                      {open ? <ChevronDown className="size-4 shrink-0 text-muted" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
                      <Database className="size-4 shrink-0 text-muted" />
                      <span className="truncate">{entry.name}</span>
                      {info?.status === 'ready' && <span className="ml-auto shrink-0 font-normal text-muted">{info.collections.length}</span>}
                    </button>
                    {open && (
                      <div className="ml-4 border-l border-line pl-2">
                        {info?.status === 'loading' && <p className="px-3 py-1.5 text-sm text-muted">Cargando colecciones…</p>}
                        {info?.status === 'error' && <p className="px-3 py-1.5 text-sm text-danger">{info.message}</p>}
                        {entry.collections.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => choose(entry.name, item.name)}
                            aria-current={entry.name === db && item.name === collection ? 'true' : undefined}
                            className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm', entry.name === db && item.name === collection ? 'bg-accent/15 text-accent' : 'hover:bg-surface-2')}
                          >
                            <span className="truncate">{item.name}</span>
                            <span className="shrink-0 text-muted">{item.count.toLocaleString('es-AR')}</span>
                          </button>
                        ))}
                        {info?.status === 'ready' && entry.collections.length === 0 && <p className="px-3 py-1.5 text-sm text-muted">{needle ? 'Nada coincide.' : 'Sin colecciones.'}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
              {visible.length === 0 && <p className="px-2 text-sm text-muted">Nada coincide.</p>}
            </nav>
          )}
        </aside>

        <section className="min-w-0">
          {!db || !collection ? (
            <EmptyState icon={<Database className="size-6" />} title="Elegí una colección">Abrí una base en la lista de la izquierda: sus colecciones y la cantidad de documentos de cada una se cargan al expandirla.</EmptyState>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-baseline gap-3">
                <h2 className="font-mono text-lg font-semibold">{db}.{collection}</h2>
                {current && <span className="text-muted">{current.count.toLocaleString('es-AR')} documentos</span>}
              </div>
              <Tabs items={[{ id: 'documentos', label: 'Documentos' }, { id: 'indices', label: 'Índices' }, { id: 'esquema', label: 'Esquema' }]} value={tab} onChange={(next) => setParams((previous) => withParam(previous, 'tab', next === 'documentos' ? null : next))} />
              {tab === 'documentos' && <DocumentsTab db={db} collection={collection} />}
              {tab === 'indices' && <IndexesTab key={`${db}.${collection}`} db={db} collection={collection} />}
              {tab === 'esquema' && <SchemaTab key={`${db}.${collection}`} db={db} collection={collection} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
