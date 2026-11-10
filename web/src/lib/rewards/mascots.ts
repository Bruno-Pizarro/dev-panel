/** La mascota del pie: cada una es un emoji que cambia de ánimo según lo que pasa en el panel. Se elige en Configuración → Diversión. */
export type Mood = 'idle' | 'sleep' | 'work' | 'happy' | 'tired' | 'worried' | 'party';

export interface Mascot {
  id: string;
  /** El nombre con el que se la presenta antes de que le pongas uno. */
  name: string;
  emoji: string;
  /** Una cara distinta para algún ánimo (si no, se usa la de siempre y el ánimo se nota en el movimiento y el detalle). */
  faces?: Partial<Record<Mood, string>>;
}

export const MASCOTS: Mascot[] = [
  { id: 'gato', name: 'Gato', emoji: '🐱', faces: { happy: '😸', party: '😹', worried: '🙀', tired: '😽', sleep: '😽' } },
  { id: 'robot', name: 'Robot', emoji: '🤖' },
  { id: 'pulpo', name: 'Pulpo', emoji: '🐙' },
  { id: 'pixel', name: 'Pixel-dev', emoji: '👾' },
  { id: 'buho', name: 'Búho', emoji: '🦉' },
  { id: 'pinguino', name: 'Pingüino', emoji: '🐧' },
  { id: 'zorro', name: 'Zorro', emoji: '🦊' },
  { id: 'rana', name: 'Rana', emoji: '🐸' },
  { id: 'dragon', name: 'Dragón', emoji: '🐲' },
  { id: 'panda', name: 'Panda', emoji: '🐼' },
  { id: 'fantasma', name: 'Fantasma', emoji: '👻' },
  { id: 'mate', name: 'El Mate', emoji: '🧉' },
];

export const mascotById = (id: string): Mascot => MASCOTS.find((item) => item.id === id) ?? MASCOTS[0]!;
export const faceOf = (mascot: Mascot, mood: Mood): string => mascot.faces?.[mood] ?? mascot.emoji;

/** El detalle que acompaña a cada ánimo (arriba a la derecha de la mascota). */
export const MOOD_BADGE: Record<Mood, string> = { idle: '', sleep: '💤', work: '💨', happy: '✨', tired: '💦', worried: '❗', party: '🎉' };

/** Lo que dice cuando le hacés clic, según cómo esté. */
export const MOOD_LINES: Record<Mood, string[]> = {
  idle: ['Acá estoy, mirando cómo trabajás.', '¿Un mate?', 'Todo tranquilo por acá.', 'Cuando quieras, arrancamos.', '¿Qué hacemos hoy?'],
  sleep: ['Zzz… cinco minutitos más…', 'Estoy descansando, como vos deberías.', 'Zzz… ¿ya es lunes?'],
  work: ['Hay agentes laburando. Yo superviso (mirando).', 'Todo en marcha. Ni respires fuerte.', '¡A full!'],
  happy: ['Qué buen día venís teniendo.', '¡Así me gusta!', 'Hoy salió todo bien, ¿no?'],
  tired: ['Ya terminó la jornada, ¿no? Yo me voy yendo.', 'Cerrá la laptop sin culpa.', 'Mañana seguimos.'],
  worried: ['Che, hay un servicio caído.', 'Algo no anda bien en el entorno…', 'Mirá los servicios, por las dudas.'],
  party: ['¡Eso! ¡Lo lograste!', '¡Fiesta!', '¡Sí señor!'],
};

export interface MoodInput {
  /** Un festejo hace un instante. */
  celebrating: boolean;
  /** Servicios obligatorios caídos (un corte parcial) o cambios sin commitear en una rama protegida. */
  trouble: boolean;
  agentsRunning: number;
  /** `before`, `during` o `after` de la jornada; null si no hay horarios. */
  workday: 'before' | 'during' | 'after' | null;
  weekend: boolean;
  commitsToday: number;
}

/** El ánimo de la mascota: manda la fiesta, después el problema, el trabajo, el cansancio, el sueño y, si no, la alegría o la calma. */
export const moodOf = (input: MoodInput): Mood => {
  if (input.celebrating) return 'party';
  if (input.trouble) return 'worried';
  if (input.agentsRunning > 0) return 'work';
  if (input.weekend || input.workday === 'before') return 'sleep';
  if (input.workday === 'after') return 'tired';
  if (input.commitsToday >= 3) return 'happy';
  return 'idle';
};
