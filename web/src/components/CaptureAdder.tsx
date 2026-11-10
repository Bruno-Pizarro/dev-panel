import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Button } from './Button';
import { useToast } from './Toast';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

type Staged = { id: number; file: File; name: string; preview: string };

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('No pude leer la imagen'));
    reader.readAsDataURL(file);
  });

/** Nombre sin extensión, para sugerirlo al renombrar (la extensión la decide el servidor según el contenido). */
const baseName = (name: string): string => name.replace(/\.[^.]+$/, '');

/**
 * Agregar capturas al ticket: pegar con Ctrl + V (desde cualquier parte de la pestaña, salvo escribiendo en un campo), arrastrar o adjuntar archivos.
 * Primero quedan en una lista de preparadas (con vista previa y nombre editable) y se suben juntas a la carpeta `capturas/` del ticket.
 */
export const CaptureAdder = ({ dir, onAdded }: { dir: string; onAdded: () => void }) => {
  const toast = useToast();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);
  const stagedRef = useRef<Staged[]>([]);
  stagedRef.current = staged;
  const input = useRef<HTMLInputElement>(null);

  const add = useCallback(
    (files: File[]) => {
      const images = files.filter((file) => ACCEPTED.includes(file.type));
      if (images.length < files.length) toast('error', 'Solo se aceptan imágenes PNG, JPG, GIF o WebP.');
      const fits = images.filter((file) => file.size <= MAX_BYTES);
      if (fits.length < images.length) toast('error', 'Una imagen pesa más de 8 MB y se dejó afuera.');
      if (!fits.length) return;
      setStaged((current) => [
        ...current,
        ...fits.map((file) => {
          counter.current += 1;
          // Lo pegado se llama `image.png`: se le da un nombre con la hora para no confundir varias.
          const generic = /^image\.(png|jpe?g|gif|webp)$/i.test(file.name);
          const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
          return { id: counter.current, file, name: generic ? `captura-${stamp}-${counter.current}` : baseName(file.name), preview: URL.createObjectURL(file) };
        }),
      ]);
    },
    [toast],
  );

  // Ctrl + V en cualquier parte de la pestaña (si no se está escribiendo en un campo de texto).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      add(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  useEffect(() => () => stagedRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  const remove = (id: number) =>
    setStaged((current) => {
      const gone = current.find((item) => item.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return current.filter((item) => item.id !== id);
    });

  const upload = async () => {
    setBusy(true);
    const pending = [...staged];
    let saved = 0;
    for (const item of pending) {
      try {
        await api.post(`/api/tickets/${encodeURIComponent(dir)}/captures`, { name: item.name || 'captura', data: await readBase64(item.file) });
        saved += 1;
        remove(item.id);
      } catch (error) {
        toast('error', `${item.name}: ${error instanceof Error ? error.message : 'no se pudo guardar'}`);
      }
    }
    setBusy(false);
    if (saved) {
      toast('success', saved === 1 ? 'Captura agregada.' : `${saved} capturas agregadas.`);
      onAdded();
    }
  };

  return (
    <section
      className={`mb-4 rounded-xl border-2 border-dashed px-4 py-4 transition-colors ${dragging ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}
      onDragOver={(event) => (event.preventDefault(), setDragging(true))}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => (event.preventDefault(), setDragging(false), add([...event.dataTransfer.files]))}
      data-testid="capture-adder"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ImagePlus className="size-5 text-accent" aria-hidden />
        <p className="min-w-0 flex-1 text-base text-muted">Pegá una captura con <kbd className="rounded border border-line bg-surface-2 px-1.5 font-mono text-sm text-fg">Ctrl + V</kbd>, arrastrala acá o adjuntá archivos.</p>
        <input ref={input} type="file" accept={ACCEPTED.join(',')} multiple className="hidden" onChange={(event) => (add([...(event.target.files ?? [])]), (event.target.value = ''))} />
        <Button icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>Adjuntar</Button>
      </div>
      {staged.length > 0 && (
        <div className="mt-4 space-y-3">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {staged.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-lg border border-line bg-bg p-2">
                <img src={item.preview} alt="" className="h-16 w-24 shrink-0 rounded object-cover object-top" />
                <input
                  value={item.name}
                  onChange={(event) => setStaged((current) => current.map((other) => (other.id === item.id ? { ...other, name: event.target.value } : other)))}
                  aria-label="Nombre de la captura"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
                />
                <button type="button" onClick={() => remove(item.id)} aria-label="Quitar" title="Quitar" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={() => void upload()} disabled={busy}>{busy ? 'Guardando…' : staged.length === 1 ? 'Agregar a las capturas' : `Agregar ${staged.length} capturas`}</Button>
        </div>
      )}
    </section>
  );
};
