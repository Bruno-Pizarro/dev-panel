import { Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from './Button';
import { Modal } from './Modal';
import { Portal } from './Portal';
import { useToast } from './Toast';

interface TicketFrameProps {
  dir: string;
  /** Ruta de la lista a la que se vuelve al eliminar (ej. "/pruebas"). */
  listPath: string;
  header: ReactNode;
  children: ReactNode;
}

/**
 * Marco de un ticket: botón "Pantalla completa" (tapa menú, lista y buscador para concentrarse en el ticket) y
 * "Eliminar carpeta", que obliga a escribir el nombre exacto. Se dibuja en un portal para no quedar recortado por la página.
 */
export const TicketFrame = ({ dir, listPath, header, children }: TicketFrameProps) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [focus, setFocus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !deleting && !document.querySelector('[aria-label="Diagrama a pantalla completa"], [aria-label="Visor de capturas"]') && setFocus(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, deleting]);

  const remove = async () => {
    setBusy(true);
    try {
      const result = await api.del<{ movedTo: string }>(`/api/tickets/${encodeURIComponent(dir)}`, { confirmName: typed });
      toast('success', `Carpeta movida a ${result.movedTo}. Se puede recuperar a mano desde ahí.`);
      setDeleting(false);
      setFocus(false);
      navigate(listPath);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <div className="mb-4 flex flex-wrap justify-end gap-2">
      <Button className="h-9" icon={focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} onClick={() => setFocus(!focus)}>{focus ? 'Salir de pantalla completa' : 'Pantalla completa'}</Button>
      <Button className="h-9" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => (setTyped(''), setDeleting(true))}>Eliminar carpeta</Button>
    </div>
  );
  const content = <>{actions}{header}{children}</>;

  return (
    <>
      {focus ? (
        <Portal>
          <div className="fixed inset-0 z-40 overflow-y-auto bg-bg px-8 py-6 animate-fade-in">
            <div className="mx-auto max-w-[1600px]">{content}</div>
          </div>
        </Portal>
      ) : content}
      <Modal open={deleting} title="Eliminar carpeta" onClose={() => setDeleting(false)} footer={<><Button onClick={() => setDeleting(false)}>Cancelar</Button><Button variant="danger" loading={busy} disabled={typed !== dir} onClick={remove}>Eliminar</Button></>}>
        <div className="space-y-4">
          <p className="text-muted">Se mueve la carpeta completa (informes, capturas, <span className="font-mono">ticket.json</span>…) a <span className="font-mono">.papelera</span> dentro de la base de conocimiento. Desaparece de las listas, pero se puede recuperar a mano.</p>
          <p>Para confirmar, escribí el nombre exacto de la carpeta:</p>
          <p className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-accent select-all">{dir}</p>
          <input value={typed} onChange={(event) => setTyped(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && typed === dir && remove()} autoFocus placeholder="Nombre de la carpeta" className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 font-mono text-sm outline-none placeholder:text-muted focus:border-danger/60" />
        </div>
      </Modal>
    </>
  );
};
