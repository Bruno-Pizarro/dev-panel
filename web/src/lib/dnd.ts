import { useEffect, useState } from 'react';

/**
 * "No molestar": silencia el aviso de agentes de la esquina y los avisos del Inicio por un rato (o hasta apagarlo). Se guarda en
 * este navegador y se comparte entre todos los componentes con un evento (como el tema).
 */
export type DndState = { until: number } | { forever: true } | null;

const KEY = 'dev-panel.dnd';
const EVENT = 'dev-panel:dnd';

export const isDndActive = (state: DndState, now = Date.now()): boolean => state !== null && ('forever' in state || state.until > now);

/** La mañana siguiente a las 06:00 (para "hasta mañana"). */
export const untilTomorrow = (now = new Date()): number => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 6, 0, 0).getTime();

/** Texto de cuánto falta ("hasta las 17:30", "hasta mañana 06:00", "hasta que lo apagues"). */
export const dndLabel = (state: DndState, now = new Date()): string => {
  if (!state || !isDndActive(state, now.getTime())) return '';
  if ('forever' in state) return 'hasta que lo apagues';
  const until = new Date(state.until);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(until.getHours())}:${pad(until.getMinutes())}`;
  return until.toDateString() === now.toDateString() ? `hasta las ${time}` : `hasta mañana ${time}`;
};

const read = (): DndState => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      if ('forever' in parsed && (parsed as { forever: unknown }).forever === true) return { forever: true };
      if ('until' in parsed && typeof (parsed as { until: unknown }).until === 'number') return { until: (parsed as { until: number }).until };
    }
  } catch {
    /* sin almacenamiento o dato roto */
  }
  return null;
};

export const setDnd = (state: DndState): void => {
  try {
    if (state === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sin almacenamiento: vale solo para esta sesión */
  }
  window.dispatchEvent(new Event(EVENT));
};

/** El estado actual; se renueva solo cuando llega la hora en que termina. */
export const useDnd = (): { state: DndState; active: boolean; label: string } => {
  const [state, setState] = useState<DndState>(read);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const active = isDndActive(state, now);
  return { state, active, label: active ? dndLabel(state, new Date(now)) : '' };
};
