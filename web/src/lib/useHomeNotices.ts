import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useServerEvent } from './hooks';
import type { HomeNoticesReport } from './types';

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

  return { report, failed, busy, load };
};

export type HomeNoticesState = ReturnType<typeof useHomeNotices>;
