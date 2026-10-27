import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Los marcadores de carga aparecen a los 350 ms (ver Skeleton). Si llegaron a verse, se mantienen un mínimo para no destellar. */
const SKELETON_DELAY_MS = 350;
const SKELETON_MIN_VISIBLE_MS = 700;

export const useAsync = <T,>(loader: () => Promise<T>): AsyncState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    let active = true;
    let hold: number | undefined;
    started.current = Date.now();
    setLoading(true);

    const finish = (apply: () => void) => {
      if (!active) return;
      apply();
      // Si el marcador ya empezó a verse, se lo deja el tiempo mínimo antes de mostrar el contenido.
      const elapsed = Date.now() - started.current;
      const wait = elapsed > SKELETON_DELAY_MS ? Math.max(0, SKELETON_DELAY_MS + SKELETON_MIN_VISIBLE_MS - elapsed) : 0;
      if (wait === 0) setLoading(false);
      else hold = window.setTimeout(() => active && setLoading(false), wait);
    };

    loader().then(
      (value) => finish(() => (setData(value), setError(null))),
      (reason: Error) => finish(() => setError(reason.message)),
    );
    return () => {
      active = false;
      if (hold !== undefined) window.clearTimeout(hold);
    };
    // `loader` es estable en cada vista; el `tick` fuerza la recarga manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { data, error, loading, reload: useCallback(() => setTick((value) => value + 1), []) };
};
