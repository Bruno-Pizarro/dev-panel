import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useServerEvent, useStoredState } from './hooks';
import type { HomeNoticesReport } from './types';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Cada cuánto se consulta el servidor por los avisos del Inicio (él decide si toca revisar de nuevo). */
const REFETCH_MS = 10 * 60_000;

interface Dismissed {
  date: string;
  ids: string[];
}

/** Los avisos del día (el servidor los revisa cada `home.refreshMinutes`, una hora por defecto): los comparten el saludo y la tarjeta "Para tener en cuenta". */
export const useHomeNotices = () => {
  const [report, setReport] = useState<HomeNoticesReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((refresh: boolean, silent = false) => {
    if (!silent) setBusy(true);
    api.get<HomeNoticesReport>(`/api/home/notices${refresh ? '?refresh=1' : ''}`).then(
      (value) => (setReport(value), setFailed(null)),
      (error: Error) => setFailed(error.message),
    ).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(false), [load]);
  // Con el panel abierto, cada tanto se vuelve a pedir lo guardado: el servidor vuelve a revisar solo cuando pasó `home.refreshMinutes` (una hora
  // por defecto), así que pedir seguido no suma llamadas a Redmine ni GitLab. Sin tapar la pantalla con el «cargando».
  useEffect(() => {
    const timer = window.setInterval(() => document.visibilityState === 'visible' && load(false, true), REFETCH_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  // Un recordatorio nuevo (de la interfaz o de Claude) aparece sin recargar: se vuelve a pedir lo guardado, sin forzar la revisión.
  useServerEvent<unknown>('reminders', () => load(false));

  // Los avisos ocultos por hoy: los comparten el saludo y la tarjeta, así el saludo no cuenta lo que ya ocultaste.
  const [dismissed, setDismissed] = useStoredState<Dismissed>('dev-panel.home.dismissed', { date: todayIso(), ids: [] });
  const hidden = useMemo(() => (dismissed.date === todayIso() ? dismissed.ids : []), [dismissed]);
  const setHidden = useCallback((ids: string[]) => setDismissed({ date: todayIso(), ids }), [setDismissed]);

  return { report, failed, busy, load, hidden, setHidden };
};

export type HomeNoticesState = ReturnType<typeof useHomeNotices>;
