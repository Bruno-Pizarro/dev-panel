import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** La pestaña pedida en la URL si es una de las válidas; si no (o sin pedir), la de por defecto. */
export const pickTab = <T extends string>(raw: string | null, valid: readonly T[], fallback: T): T => (valid.find((id) => id === raw) ?? fallback);

/** Copia de los parámetros con `key` puesto (o quitado si `value` es null), sin tocar el resto. */
export const withParam = (params: URLSearchParams, key: string, value: string | null): URLSearchParams => {
  const next = new URLSearchParams(params);
  if (value === null) next.delete(key);
  else next.set(key, value);
  return next;
};

/**
 * Pestaña actual guardada en la URL (`?tab=`), para que al recargar la pantalla vuelva a la misma. La pestaña por defecto no
 * escribe nada (URL limpia). Reemplaza la entrada del historial: cambiar de pestaña no llena el botón «atrás».
 */
export const useTabParam = <T extends string>(valid: readonly T[], fallback: T): [T, (tab: T) => void] => {
  const [params, setParams] = useSearchParams();
  const tab = pickTab(params.get('tab'), valid, fallback);
  const setTab = useCallback((next: T) => setParams((previous) => withParam(previous, 'tab', next === fallback ? null : next), { replace: true }), [fallback, setParams]);
  return [tab, setTab];
};

/** Pantalla completa del ticket guardada en la URL (`?full=1`). */
export const useFullParam = (): [boolean, (value: boolean) => void, () => void] => {
  const [params, setParams] = useSearchParams();
  const full = params.get('full') === '1';
  const set = useCallback((value: boolean) => setParams((previous) => withParam(previous, 'full', value ? '1' : null), { replace: true }), [setParams]);
  const toggle = useCallback(() => setParams((previous) => withParam(previous, 'full', previous.get('full') === '1' ? null : '1'), { replace: true }), [setParams]);
  return [full, set, toggle];
};
