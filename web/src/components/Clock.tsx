import { useEffect, useState } from 'react';

/** La hora actual (HH:MM) para la barra de arriba, en fuente monoespaciada con cifras de ancho fijo para que no baile. Se actualiza justo al cambiar el minuto. */
export const Clock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      const current = new Date();
      setNow(current);
      // Se vuelve a calcular hasta el próximo minuto exacto (no se acumula deriva).
      timer = window.setTimeout(tick, 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 50);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const title = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <time dateTime={`${hours}:${minutes}`} title={title} data-testid="clock" className="flex shrink-0 items-center rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-base font-semibold leading-6 tabular-nums tracking-wider text-fg">
      {hours}
      <span className="animate-pulse-dot px-px text-accent" aria-hidden>:</span>
      {minutes}
    </time>
  );
};
