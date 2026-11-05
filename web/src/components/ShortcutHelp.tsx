import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DEFS, displayKey, GOTO_PREFIX_ID } from '../lib/shortcuts';
import { useShortcutSettings } from '../lib/useShortcuts';
import { Button } from './Button';
import { Key } from './Key';
import { Modal } from './Modal';

/** Ayuda con todos los atajos (se abre con "?"). Sale de la misma lista que usa el panel, así nunca queda desactualizada. */
export const ShortcutHelp = () => {
  const { helpOpen, closeHelp, bindings } = useShortcutSettings();
  const navigate = useNavigate();
  const keyOf = (id: string) => displayKey(bindings[id] ?? '');
  const main = DEFS.filter((def) => def.context === 'main' && def.id !== GOTO_PREFIX_ID);
  const groups = [...new Set(main.map((def) => def.group))];
  return (
    <Modal
      open={helpOpen}
      title="Atajos de teclado"
      onClose={closeHelp}
      size="xl"
      footer={<><Button onClick={closeHelp}>Cerrar</Button><Button variant="primary" icon={<Settings className="size-4" />} onClick={() => (closeHelp(), navigate('/configuracion?seccion=atajos'))}>Cambiar los atajos</Button></>}
    >
      <div className="grid max-h-[65vh] gap-6 overflow-y-auto md:grid-cols-2">
        {groups.map((group) => (
          <section key={group}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{group}</h3>
            <ul className="space-y-2">
              {main.filter((def) => def.group === group).map((def) => (
                <li key={def.id} className="flex items-center justify-between gap-3">
                  <span>{def.label}</span>
                  <span className="flex items-center gap-1.5"><Key>{keyOf(def.id)}</Key>{def.alt.map((alt) => <Key key={alt}>{displayKey(alt)}</Key>)}</span>
                </li>
              ))}
              {group === 'Pestañas' && <li className="flex items-center justify-between gap-3"><span>Ir a la pestaña número…</span><span className="flex items-center gap-1.5"><Key>1</Key><span className="text-muted">…</span><Key>9</Key></span></li>}
            </ul>
          </section>
        ))}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Ir a… (primero {keyOf(GOTO_PREFIX_ID)}, después la letra)</h3>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {DEFS.filter((def) => def.context === 'goto').map((def) => (
              <li key={def.id} className="flex items-center justify-between gap-3"><span className="truncate">{def.label.replace(/^Ir a /, '')}</span><span className="flex items-center gap-1"><Key>{keyOf(GOTO_PREFIX_ID)}</Key><Key>{keyOf(def.id)}</Key></span></li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">General</h3>
          <ul className="space-y-2">
            <li className="flex items-center justify-between gap-3"><span>Búsqueda rápida</span><span className="flex items-center gap-1.5"><Key>Ctrl</Key><Key>K</Key></span></li>
            <li className="flex items-center justify-between gap-3"><span>Cerrar una ventana o la pantalla completa</span><Key>Esc</Key></li>
          </ul>
          <p className="mt-3 text-sm text-muted">Los atajos no actúan mientras escribís en un campo de texto o hay una ventana abierta.</p>
        </section>
      </div>
    </Modal>
  );
};
