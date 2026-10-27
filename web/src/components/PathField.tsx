import { ChevronUp, File, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { Field } from './Field';
import { Modal } from './Modal';
import { useToast } from './Toast';

interface Listing {
  path: string;
  parent: string | null;
  entries: Array<{ name: string; isDir: boolean }>;
  truncated: boolean;
}

type Pick = { status: 'picked'; path: string } | { status: 'cancelled' } | { status: 'unavailable'; reason: string };

/** Explorador propio: respaldo cuando el sistema no tiene selector nativo. */
const Browser = ({ open, kind, start, onPick, onClose }: { open: boolean; kind: 'folder' | 'file'; start: string; onPick: (path: string) => void; onClose: () => void }) => {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (path: string) =>
    api.get<Listing>(`/api/fs/list?path=${encodeURIComponent(path)}&files=${kind === 'file' ? 1 : 0}`).then(
      (result) => (setListing(result), setError(null)),
      (reason: Error) => setError(reason.message),
    );

  useEffect(() => {
    if (open) void go(start || '~');
    // Se abre una sola vez por apertura del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} title={kind === 'folder' ? 'Elegí una carpeta' : 'Elegí un archivo'} onClose={onClose} size="xl" footer={kind === 'folder' && listing ? <Button variant="primary" onClick={() => onPick(listing.path)}>Usar esta carpeta</Button> : undefined}>
      <div className="mb-3 flex items-center gap-2">
        <Button className="h-9" icon={<ChevronUp className="size-4" />} disabled={!listing?.parent} onClick={() => listing?.parent && go(listing.parent)}>Subir</Button>
        <span className="truncate font-mono text-sm text-muted">{listing?.path}</span>
      </div>
      {error && <p className="mb-2 text-danger">{error}</p>}
      <ul className="h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-bg">
        {listing?.entries.map((entry) => (
          <li key={entry.name}>
            <button
              type="button"
              onClick={() => (entry.isDir ? go(`${listing.path}/${entry.name}`) : onPick(`${listing.path}/${entry.name}`))}
              className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2', !entry.isDir && 'text-muted')}
            >
              {entry.isDir ? <Folder className="size-4 shrink-0 text-accent" aria-hidden /> : <File className="size-4 shrink-0" aria-hidden />}
              <span className="truncate font-mono">{entry.name}</span>
            </button>
          </li>
        ))}
        {listing && listing.entries.length === 0 && <li className="px-4 py-8 text-center text-muted">Carpeta vacía.</li>}
      </ul>
    </Modal>
  );
};

interface PathFieldProps {
  label: string;
  help?: string;
  value: string;
  kind?: 'folder' | 'file';
  status?: ReactNode;
  onChange: (value: string) => void;
}

/** Campo de ruta con botón "Elegir…": abre el explorador de archivos del sistema; si no hay, uno propio. También se puede escribir. */
export const PathField = ({ label, help, value, kind = 'folder', status, onChange }: PathFieldProps) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const choose = async () => {
    setBusy(true);
    try {
      const result = await api.post<Pick>('/api/fs/pick', { kind, ...(value ? { initial: value } : {}) });
      if (result.status === 'picked') onChange(result.path);
      else if (result.status === 'unavailable') setBrowsing(true);
    } catch (error) {
      toast('error', (error as Error).message);
      setBrowsing(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Field label={label} {...(help ? { help } : {})} value={value} onChange={onChange} {...(status ? { status } : {})} />
      <Button className="mt-2 h-9" icon={<FolderOpen className="size-4" />} loading={busy} onClick={choose}>Elegir {kind === 'folder' ? 'carpeta' : 'archivo'}…</Button>
      <Browser open={browsing} kind={kind} start={value} onClose={() => setBrowsing(false)} onPick={(path) => (onChange(path), setBrowsing(false))} />
    </div>
  );
};
