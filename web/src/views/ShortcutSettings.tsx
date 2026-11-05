import { Keyboard, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Key } from '../components/Key';
import { DEFS, displayKey, GOTO_PREFIX_ID } from '../lib/shortcuts';
import { useShortcutSettings } from '../lib/useShortcuts';

/** Configuración → Atajos de teclado: ver y cambiar la tecla de cada acción. Se guarda al instante, en este navegador. */
export const ShortcutSettings = () => {
  const { bindings, showKeys, setShowKeys, setBinding, reset, resetAll, pause } = useShortcutSettings();
  const [capturing, setCapturing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Mientras se espera la tecla nueva, el resto de los atajos se detiene.
  useEffect(() => {
    if (!capturing) return;
    const resume = pause();
    const onKey = (event: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(null);
        setMessage(null);
        return;
      }
      const error = setBinding(capturing, event.key);
      setMessage(error);
      if (!error) setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      resume();
    };
  }, [capturing, pause, setBinding]);

  const groups = [...new Set(DEFS.map((def) => def.group))];
  return (
    <Card title="Atajos de teclado" action={<Button icon={<RotateCcw className="size-4" />} onClick={() => (resetAll(), setCapturing(null), setMessage(null))}>Restablecer todos</Button>}>
      <p className="mb-4 text-muted">Cada acción tiene una tecla. Tocá «Cambiar» y pulsá la tecla nueva. Los atajos se guardan al instante en este navegador y no actúan mientras escribís en un campo o hay una ventana abierta. Con <Key>?</Key> ves la lista completa desde cualquier pantalla.</p>
      <label className="mb-6 flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={showKeys} onChange={(event) => setShowKeys(event.target.checked)} />
        <span>
          <span className="block font-medium">Mostrar las teclas a la vista</span>
          <span className="block text-sm text-muted">Dibuja la tecla junto a las pestañas, el menú lateral y los botones que tienen atajo.</span>
        </span>
      </label>
      {message && <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-warning" role="alert">{message}</p>}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{group}{group === 'Ir a…' ? ` (después de ${displayKey(bindings[GOTO_PREFIX_ID] ?? '')})` : ''}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {DEFS.filter((def) => def.group === group).map((def) => {
                const changed = bindings[def.id] !== def.defaultKey;
                return (
                  <li key={def.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">{def.label}</span>
                    <span className="flex items-center gap-1.5">
                      {capturing === def.id ? <span className="text-sm text-accent" aria-live="polite">Pulsá una tecla… (Esc cancela)</span> : <Key>{displayKey(bindings[def.id] ?? '')}</Key>}
                      {def.alt.map((alt) => <Key key={alt} className="opacity-70">{displayKey(alt)}</Key>)}
                    </span>
                    <Button className="h-9" icon={<Keyboard className="size-4" />} onClick={() => (setMessage(null), setCapturing(capturing === def.id ? null : def.id))}>{capturing === def.id ? 'Cancelar' : 'Cambiar'}</Button>
                    <Button variant="ghost" className="h-9" disabled={!changed} icon={<RotateCcw className="size-4" />} onClick={() => (reset(def.id), setMessage(null))}>Restablecer</Button>
                  </li>
                );
              })}
              {group === 'Pestañas' && (
                <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">Ir a la pestaña número… <span className="text-sm text-muted">(fijas)</span></span>
                  <span className="flex items-center gap-1.5"><Key>1</Key><span className="text-muted">…</span><Key>9</Key></span>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
};
