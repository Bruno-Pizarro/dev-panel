import { useEffect, useState } from 'react';
import { api } from './api';

export type Health = 'checking' | 'ok' | 'down';

/** Consulta /api/health cada 10 s para reflejar si el servidor del panel responde. */
export const useHealth = (): Health => {
  const [health, setHealth] = useState<Health>('checking');
  useEffect(() => {
    let active = true;
    const check = () =>
      api.get('/api/health').then(
        () => active && setHealth('ok'),
        () => active && setHealth('down'),
      );
    void check();
    const timer = window.setInterval(check, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return health;
};
