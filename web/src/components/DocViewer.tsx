import { FileText } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useReloadOn } from '../lib/hooks';
import { fileUrl } from '../lib/tickets';
import { useAsync } from '../lib/useAsync';
import { Markdown } from './Markdown';
import { Skeleton } from './Skeleton';

const Reader = ({ dir, file, refreshKey }: { dir: string; file: string; refreshKey: number }) => {
  const doc = useAsync(() => api.get<{ content: string }>(fileUrl(dir, file)));
  useReloadOn(refreshKey, doc.reload);
  if (doc.loading && !doc.data) return <Skeleton className="h-64" />;
  if (doc.error || !doc.data) return <p className="text-danger">No se pudo leer el documento: {doc.error}</p>;
  return <Markdown source={doc.data.content} ticket={{ dir, file }} />;
};

/** Lista de documentos MD a la izquierda y lector a la derecha. */
export const DocViewer = ({ dir, files, initial, refreshKey = 0 }: { dir: string; files: string[]; initial?: string | null; refreshKey?: number }) => {
  const [selected, setSelected] = useState<string | null>(initial && files.includes(initial) ? initial : (files[0] ?? null));
  if (!files.length) return <p className="text-muted">Esta carpeta no tiene documentos Markdown.</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <ul className="space-y-1 self-start rounded-2xl border border-line bg-surface p-2">
        {files.map((file) => (
          <li key={file}>
            <button type="button" onClick={() => setSelected(file)} className={cn('flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors', selected === file ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="break-all">{file}</span>
            </button>
          </li>
        ))}
      </ul>
      <article className="min-w-0 rounded-2xl border border-line bg-surface p-6">{selected && <Reader key={selected} dir={dir} file={selected} refreshKey={refreshKey} />}</article>
    </div>
  );
};
