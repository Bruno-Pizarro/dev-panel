import { useEffect, useRef } from 'react';
import type { CelebrationLevel } from './types';

/** La interfaz avisa con este evento que se completó algo (un festejo inmediato); el `RewardHost` lo muestra. */
export const CELEBRATE_EVENT = 'dev-panel:celebrate';

export interface CelebrateDetail {
  reason: string;
  level: CelebrationLevel;
}

export const celebrate = (reason: string, level: CelebrationLevel = 'medium'): void => {
  window.dispatchEvent(new CustomEvent<CelebrateDetail>(CELEBRATE_EVENT, { detail: { reason, level } }));
};

/** Festeja cuando `done` pasa de falso a verdadero (no al abrir la pantalla con todo ya hecho). */
export const useCelebrateWhen = (done: boolean, reason: string, level: CelebrationLevel = 'medium'): void => {
  const previous = useRef<boolean | null>(null);
  useEffect(() => {
    if (previous.current === false && done) celebrate(reason, level);
    previous.current = done;
  }, [done, reason, level]);
};

/** Lo que se dice en la tarjeta de cada festejo pedido por la interfaz. Los de logros y récords tienen la suya. */
export const CELEBRATION_TEXT: Record<string, { title: string; text: string }> = {
  'checklist-complete': { title: '¡Día completo!', text: 'Todo el checklist tildado.' },
  'ticket-ready': { title: '¡Listo para abrir los MRs!', text: 'El semáforo está todo en verde.' },
  'all-viewed': { title: '¡Todo visto!', text: 'Revisaste cada archivo del ticket.' },
  'manual-done': { title: '¡Pruebas manuales completas!', text: 'Cada caso, probado.' },
  'agent-done': { title: 'Terminó un agente', text: 'Uno menos en la cola.' },
  demo: { title: 'Así se festeja', text: 'Confeti, sonido (si lo prendés) y todo. Se apaga en Configuración → Diversión.' },
};
