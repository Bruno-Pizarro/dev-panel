import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStoredState } from './hooks';
import { BLOCKING_SELECTORS, canBind, DEFS, displayKey, findConflict, GOTO_PREFIX, GOTO_PREFIX_ID, HELP_ID, isEditableTarget, matchAction, NUMBER_TABS_ID, resolveBindings, type Bindings } from './shortcuts';

/** Un atajo recibe, solo para los números, la posición pedida (1–9). */
export type ShortcutHandler = (position?: number) => void;

interface Stored {
  bindings: Bindings;
  showKeys: boolean;
}

interface ShortcutsContextValue {
  bindings: Bindings;
  showKeys: boolean;
  setShowKeys: (value: boolean) => void;
  /** Cambia la tecla de una acción; devuelve el motivo si no se pudo. */
  setBinding: (id: string, key: string) => string | null;
  reset: (id: string) => void;
  resetAll: () => void;
  register: (id: string, handler: ShortcutHandler) => () => void;
  /** Detiene los atajos mientras se elige una tecla nueva; devuelve cómo reanudarlos. */
  pause: () => () => void;
  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

const useShortcutsContext = (): ShortcutsContextValue => {
  const context = useContext(ShortcutsContext);
  if (!context) throw new Error('ShortcutsProvider ausente');
  return context;
};

const GOTO_WAIT_MS = 1500;

export const ShortcutsProvider = ({ children }: { children: ReactNode }) => {
  const [stored, setStored] = useStoredState<Stored>('dev-panel.shortcuts', { bindings: {}, showKeys: true });
  const bindings = useMemo(() => resolveBindings(DEFS, stored.bindings), [stored.bindings]);
  const handlers = useRef(new Map<string, Array<{ token: symbol; run: ShortcutHandler }>>());
  const paused = useRef(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [waitingGoto, setWaitingGoto] = useState(false);
  const gotoTimer = useRef<number | undefined>(undefined);
  const waitingRef = useRef(false);

  const register = useCallback((id: string, run: ShortcutHandler) => {
    const token = Symbol(id);
    handlers.current.set(id, [...(handlers.current.get(id) ?? []), { token, run }]);
    return () => {
      const next = (handlers.current.get(id) ?? []).filter((entry) => entry.token !== token);
      if (next.length) handlers.current.set(id, next);
      else handlers.current.delete(id);
    };
  }, []);

  const setBinding = useCallback(
    (id: string, key: string): string | null => {
      if (!canBind(key)) return 'Esa tecla no se puede usar (los números 1–9 y el espacio están reservados).';
      const conflict = findConflict(DEFS, bindings, id, key);
      if (conflict) return `Ya la usa «${conflict.label}». Cambiá esa primero.`;
      setStored({ ...stored, bindings: { ...stored.bindings, [id]: key } });
      return null;
    },
    [bindings, stored, setStored],
  );
  const reset = useCallback(
    (id: string) => {
      const rest = { ...stored.bindings };
      delete rest[id];
      setStored({ ...stored, bindings: rest });
    },
    [stored, setStored],
  );
  const resetAll = useCallback(() => setStored({ ...stored, bindings: {} }), [stored, setStored]);
  const setShowKeys = useCallback((value: boolean) => setStored({ ...stored, showKeys: value }), [stored, setStored]);
  const pause = useCallback(() => {
    paused.current += 1;
    return () => {
      paused.current = Math.max(0, paused.current - 1);
    };
  }, []);

  useEffect(() => {
    const clearWait = () => {
      window.clearTimeout(gotoTimer.current);
      setWaitingGoto(false);
    };
    const call = (id: string, position?: number): boolean => {
      const list = handlers.current.get(id);
      const last = list?.[list.length - 1];
      if (!last) return false;
      last.run(position);
      return true;
    };
    const onKey = (event: KeyboardEvent) => {
      if (paused.current > 0 || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target) || BLOCKING_SELECTORS.some((selector) => document.querySelector(selector))) {
        clearWait();
        return;
      }
      // Segunda tecla de "ir a…".
      if (waitingRef.current) {
        waitingRef.current = false;
        clearWait();
        if (event.key === 'Escape') return;
        const target = matchAction(DEFS, bindings, 'goto', event.key);
        if (target && call(target.id)) event.preventDefault();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        if (call(NUMBER_TABS_ID, Number(event.key))) event.preventDefault();
        return;
      }
      const action = matchAction(DEFS, bindings, 'main', event.key);
      if (!action) return;
      if (action.id === GOTO_PREFIX_ID) {
        event.preventDefault();
        waitingRef.current = true;
        setWaitingGoto(true);
        gotoTimer.current = window.setTimeout(() => {
          waitingRef.current = false;
          setWaitingGoto(false);
        }, GOTO_WAIT_MS);
        return;
      }
      if (action.id === HELP_ID) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (call(action.id)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(gotoTimer.current);
    };
  }, [bindings]);
  const value = useMemo<ShortcutsContextValue>(
    () => ({ bindings, showKeys: stored.showKeys, setShowKeys, setBinding, reset, resetAll, register, pause, helpOpen, openHelp: () => setHelpOpen(true), closeHelp: () => setHelpOpen(false) }),
    [bindings, stored.showKeys, setShowKeys, setBinding, reset, resetAll, register, pause, helpOpen],
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      {waitingGoto && <GotoHint bindings={bindings} />}
    </ShortcutsContext.Provider>
  );
};

/** Aviso al pulsar "ir a…": muestra las letras de cada destino hasta que se elige uno. */
const GotoHint = ({ bindings }: { bindings: Bindings }) => (
  <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-5 py-3 shadow-pop" role="status">
    <span className="text-sm font-medium text-muted">Ir a…</span>
    {DEFS.filter((def) => def.context === 'goto').map((def) => (
      <span key={def.id} className="flex items-center gap-1.5 text-sm">
        <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-line bg-surface-2 px-1.5 font-mono text-sm text-fg">{displayKey(bindings[def.id] ?? '')}</kbd>
        {def.label.replace(/^Ir a /, '')}
      </span>
    ))}
  </div>
);

/** Registra una acción mientras el componente está montado (y `enabled`); la última registrada es la que responde. */
export const useShortcut = (id: string, handler: ShortcutHandler, enabled = true): void => {
  const { register } = useShortcutsContext();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => (enabled ? register(id, (position) => latest.current(position)) : undefined), [id, enabled, register]);
};

/** Varias acciones a la vez (por ejemplo, todos los destinos del menú). */
export const useShortcutMap = (map: Record<string, ShortcutHandler>, enabled = true): void => {
  const { register } = useShortcutsContext();
  const latest = useRef(map);
  latest.current = map;
  const ids = Object.keys(map).join('|');
  useEffect(() => {
    if (!enabled) return;
    const unregister = ids.split('|').filter(Boolean).map((id) => register(id, (position) => latest.current[id]?.(position)));
    return () => unregister.forEach((fn) => fn());
  }, [ids, enabled, register]);
};

/** La tecla de una acción, como se dibuja ("A", "←", "G"…). */
export const useKeyFor = (id: string): string => displayKey(useShortcutsContext().bindings[id] ?? '');

export const useShortcutSettings = () => useShortcutsContext();
export { GOTO_PREFIX };
