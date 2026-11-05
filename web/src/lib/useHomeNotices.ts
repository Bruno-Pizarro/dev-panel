import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useServerEvent, useStoredState } from './hooks';
import type { HomeNoticesReport } from './types';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

interface Dismissed {
  date: string;
  ids: string[];
}

/** Los avisos del día (el servidor los revisa una vez por día): los comparten el saludo y la tarjeta "Para tener en cuenta". */
export const useHomeNotices = () => {
  const [report, setReport] = useState<HomeNoticesReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((refresh: boolean) => {
    setBusy(true);
    api.get<HomeNoticesReport>(`/api/home/notices${refresh ? '?refresh=1' : ''}`).then(
      (value) => (setReport(value), setFailed(null)),
      (error: Error) => setFailed(error.message),
    ).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(false), [load]);
  // Un recordatorio nuevo (de la interfaz o de Claude) aparece sin recargar: se vuelve a pedir lo guardado, sin forzar la revisión.
  useServerEvent<unknown>('reminders', () => load(false));

  // Los avisos ocultos por hoy: los comparten el saludo y la tarjeta, así el saludo no cuenta lo que ya ocultaste.
  const [dismissed, setDismissed] = useStoredState<Dismissed>('dev-panel.home.dismissed', { date: todayIso(), ids: [] });
  const hidden = useMemo(() => (dismissed.date === todayIso() ? dismissed.ids : []), [dismissed]);
  const setHidden = useCallback((ids: string[]) => setDismissed({ date: todayIso(), ids }), [setDismissed]);

  return { report, failed, busy, load, hidden, setHidden };
};

export type HomeNoticesState = ReturnType<typeof useHomeNotices>;
