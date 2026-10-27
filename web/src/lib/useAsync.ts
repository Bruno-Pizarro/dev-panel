import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export const useAsync = <T,>(loader: () => Promise<T>): AsyncState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loader().then(
      (value) => active && (setData(value), setError(null), setLoading(false)),
      (reason: Error) => active && (setError(reason.message), setLoading(false)),
    );
    return () => {
      active = false;
    };
    // `loader` es estable en cada vista; el `tick` fuerza la recarga manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { data, error, loading, reload: useCallback(() => setTick((value) => value + 1), []) };
};
