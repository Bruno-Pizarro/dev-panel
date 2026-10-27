import { useCallback, useEffect, useRef, useState } from 'react';

export interface Polled<T> {
  data: T | null;
  error: string | null;
  refresh: () => void;
}

/** Consulta periódica que conserva el dato anterior mientras recarga (sin parpadeos). */
export const usePolling = <T,>(loader: () => Promise<T>, intervalMs: number): Polled<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = useCallback(() => {
    loaderRef.current().then(
      (value) => (setData(value), setError(null)),
      (reason: Error) => setError(reason.message),
    );
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { data, error, refresh };
};

/** Escucha un canal del bus de eventos del servidor (SSE). */
export const useServerEvent = <T,>(channel: string, onEvent: (data: T) => void): void => {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    const source = new EventSource('/api/events');
    source.addEventListener(channel, (event) => handler.current(JSON.parse((event as MessageEvent<string>).data) as T));
    return () => source.close();
  }, [channel]);
};

/** Estado guardado en localStorage (comodidad por usuario; si no está disponible, se comporta como useState). */
export const useStoredState = <T,>(key: string, initial: T): [T, (value: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
    },
    [key],
  );
  return [value, update];
};
