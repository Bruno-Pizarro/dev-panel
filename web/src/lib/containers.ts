import type { ContainerInfo } from './types';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface Explanation {
  label: string;
  tone: Tone;
  /** Qué significa. */
  meaning: string;
  /** Qué hacer (vacío si no hace falta hacer nada). */
  action: string;
}

/** Código de salida de "Exited (1) 4 days ago". */
export const exitCode = (status: string): number | null => {
  const match = /Exited \((\d+)\)/.exec(status);
  return match ? Number(match[1]) : null;
};

/** Traduce el estado de Docker a algo entendible, con qué significa y qué hacer. */
export const explainContainer = (container: Pick<ContainerInfo, 'state' | 'status'>): Explanation => {
  const { state, status } = container;
  if (state === 'running') {
    if (status.includes('unhealthy')) {
      return {
        label: 'Corriendo, con healthcheck en rojo',
        tone: 'warning',
        meaning: 'El proceso está vivo, pero el chequeo de salud que define el propio contenedor (un comando que Docker ejecuta cada tanto) está fallando. Es decir: arrancó, pero no responde como debería.',
        action: 'Abrí Logs para ver qué falla. Si es algo temporal, probá Reiniciar. Si vuelve a fallar, revisá lo que ese servicio necesita (el puerto, el disco o que otro servicio del que depende esté arriba).',
      };
    }
    if (status.includes('starting')) {
      return { label: 'Iniciando', tone: 'info', meaning: 'Docker todavía está evaluando el healthcheck: el contenedor arrancó pero aún no se confirmó que esté sano.', action: 'Esperá unos segundos. Si sigue así más de un minuto, mirá los Logs.' };
    }
    return { label: 'Corriendo', tone: 'success', meaning: 'El contenedor está en ejecución.', action: '' };
  }
  if (state === 'exited') {
    const code = exitCode(status);
    if (code === 0) {
      return { label: 'Terminó (código 0)', tone: 'neutral', meaning: 'El proceso salió sin errores. Es normal en tareas que corren una vez; no lo es en un servicio que debería quedar siempre arriba.', action: 'Si debería estar corriendo, levantalo desde Levantado o miralo en Logs.' };
    }
    if (code === 137) {
      return { label: 'Detenido a la fuerza (137)', tone: 'danger', meaning: 'Alguien lo detuvo con kill o se quedó sin memoria (el sistema lo cortó).', action: 'Si no lo detuviste vos, revisá la memoria disponible de Docker. Después levantalo de nuevo.' };
    }
    return {
      label: `Se cayó${code !== null ? ` (código ${code})` : ''}`,
      tone: 'danger',
      meaning: 'El proceso terminó con un error. Pasa seguido al cambiar de rama, cuando falta una variable del .env o cuando MongoDB o RabbitMQ todavía no estaban arriba.',
      action: 'Abrí Logs: las últimas líneas dicen la causa. Corregila y volvé a levantarlo desde Levantado (respetando el orden).',
    };
  }
  if (state === 'restarting') return { label: 'Reiniciándose', tone: 'warning', meaning: 'Docker lo reinicia una y otra vez porque el proceso se cae apenas arranca.', action: 'Mirá Logs para encontrar el error que lo tumba; mientras no se corrija, seguirá en bucle.' };
  if (state === 'paused') return { label: 'Pausado', tone: 'neutral', meaning: 'Está congelado: existe pero no ejecuta nada.', action: 'Reanudalo con docker unpause o reinicialo.' };
  if (state === 'created') return { label: 'Creado, sin arrancar', tone: 'neutral', meaning: 'El contenedor existe pero nunca se inició.', action: 'Levantalo desde Levantado.' };
  return { label: state, tone: 'neutral', meaning: 'Estado poco común de Docker.', action: 'Mirá Logs o recrealo desde Levantado.' };
};

export type SortKey = 'order' | 'recent' | 'name' | 'state';

export const sortContainers = <T extends ContainerInfo>(containers: T[], key: SortKey): T[] => {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const sorted = [...containers];
  if (key === 'name') return sorted.sort(byName);
  if (key === 'state') return sorted.sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || byName(a, b));
  if (key === 'recent') {
    return sorted.sort((a, b) => (b.startedAt ? Date.parse(b.startedAt) : 0) - (a.startedAt ? Date.parse(a.startedAt) : 0) || byName(a, b));
  }
  // Orden de levantado; dentro del mismo lugar, el que arrancó más recientemente primero.
  return sorted.sort((a, b) => a.rank - b.rank || (b.startedAt ? Date.parse(b.startedAt) : 0) - (a.startedAt ? Date.parse(a.startedAt) : 0) || byName(a, b));
};
