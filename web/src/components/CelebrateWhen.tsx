import { useCelebrateWhen } from '../lib/rewards/bus';
import type { CelebrationLevel } from '../lib/rewards/types';

/** No dibuja nada: festeja cuando `done` pasa de falso a verdadero. Sirve dentro de pantallas que arman su contenido con funciones. */
export const CelebrateWhen = ({ done, reason, level = 'medium' }: { done: boolean; reason: string; level?: CelebrationLevel }) => {
  useCelebrateWhen(done, reason, level);
  return null;
};
