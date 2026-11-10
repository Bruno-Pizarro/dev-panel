/** La mascota del pie: cada una es un emoji que cambia de ánimo según lo que pasa en el panel. Se elige en Configuración → Diversión. */
export type Mood = 'idle' | 'sleep' | 'work' | 'happy' | 'tired' | 'worried' | 'party';

/** Una tira de animación horizontal: `frames` cuadros iguales, uno al lado del otro, a `fps` cuadros por segundo. */
export interface Strip {
  src: string;
  frames: number;
  fps: number;
}

/** Los sprites de una mascota (hojas de `public/mascots/<id>/`). Cada ánimo usa una tira; los que no tienen la suya se arreglan con movimiento en CSS. */
export interface SpriteSet {
  frameW: number;
  frameH: number;
  /** Pixel art: se escala sin suavizar. */
  pixelated: boolean;
  idle: Strip;
  run: Strip;
  walk?: Strip;
  party?: Strip;
  worried?: Strip;
  /** Un solo cuadro dormida; si no hay, se congela el primer cuadro del idle. */
  sleep?: Strip;
}

export interface Mascot {
  id: string;
  /** El nombre con el que se la presenta antes de que le pongas uno. */
  name: string;
  emoji: string;
  /** Una cara distinta para algún ánimo (si no, se usa la de siempre y el ánimo se nota en el movimiento y el detalle). */
  faces?: Partial<Record<Mood, string>>;
  /** Si tiene sprites animados se dibujan en lugar del emoji (que queda de respaldo). */
  sprite?: SpriteSet;
}

const strip = (id: string, name: string, frames: number, fps: number): Strip => ({ src: `/mascots/${id}/${name}.png`, frames, fps });

export const MASCOTS: Mascot[] = [
  // Con sprites animados (packs gratuitos CC0, ver public/mascots/CREDITS.md)
  { id: 'gatito', name: 'Gatito', emoji: '🐱', sprite: { frameW: 74, frameH: 64, pixelated: false, idle: strip('gatito', 'idle', 12, 10), run: strip('gatito', 'run', 10, 14), party: strip('gatito', 'party', 10, 14), worried: strip('gatito', 'worried', 6, 10), sleep: strip('gatito', 'sleep', 1, 1) } },
  { id: 'zorro-pixel', name: 'Zorro pixel', emoji: '🦊', sprite: { frameW: 64, frameH: 36, pixelated: true, idle: strip('zorro-pixel', 'idle', 6, 6), run: strip('zorro-pixel', 'run', 6, 12), walk: strip('zorro-pixel', 'walk', 8, 10) } },
  { id: 'oso', name: 'Oso', emoji: '🐻', sprite: { frameW: 64, frameH: 33, pixelated: true, idle: strip('oso', 'idle', 12, 8), run: strip('oso', 'run', 5, 10), walk: strip('oso', 'walk', 8, 8) } },
  { id: 'jabali', name: 'Jabalí', emoji: '🐗', sprite: { frameW: 64, frameH: 40, pixelated: true, idle: strip('jabali', 'idle', 8, 8), run: strip('jabali', 'run', 6, 12), walk: strip('jabali', 'walk', 8, 10) } },
  { id: 'ciervo', name: 'Ciervo', emoji: '🦌', sprite: { frameW: 72, frameH: 52, pixelated: true, idle: strip('ciervo', 'idle', 10, 8), run: strip('ciervo', 'run', 6, 12), walk: strip('ciervo', 'walk', 8, 10) } },
  { id: 'conejo', name: 'Conejo', emoji: '🐰', sprite: { frameW: 32, frameH: 26, pixelated: true, idle: strip('conejo', 'idle', 10, 8), run: strip('conejo', 'run', 6, 12), party: strip('conejo', 'hop', 10, 12) } },
  { id: 'lobo', name: 'Lobo', emoji: '🐺', sprite: { frameW: 64, frameH: 40, pixelated: true, idle: strip('lobo', 'walk', 8, 5), run: strip('lobo', 'run', 6, 12), walk: strip('lobo', 'walk', 8, 10), party: strip('lobo', 'howl', 10, 8) } },
  // Con emoji animado por CSS
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

/** Qué tira usa cada ánimo, a qué velocidad y si queda congelada (dormida). Lo que no tiene tira propia se resuelve con las animaciones de CSS. */
export const stripFor = (sprite: SpriteSet, mood: Mood): { strip: Strip; speed: number; frozen: boolean } => {
  switch (mood) {
    case 'work': return { strip: sprite.run, speed: 1, frozen: false };
    case 'party': return { strip: sprite.party ?? sprite.run, speed: 1.2, frozen: false };
    case 'happy': return { strip: sprite.walk ?? sprite.idle, speed: 1, frozen: false };
    case 'worried': return { strip: sprite.worried ?? sprite.idle, speed: 1.4, frozen: false };
    case 'tired': return { strip: sprite.idle, speed: 0.5, frozen: false };
    case 'sleep': return sprite.sleep ? { strip: sprite.sleep, speed: 1, frozen: true } : { strip: sprite.idle, speed: 1, frozen: true };
    default: return { strip: sprite.idle, speed: 1, frozen: false };
  }
};
