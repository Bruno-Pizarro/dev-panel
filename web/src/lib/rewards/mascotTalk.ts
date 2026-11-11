import { MOOD_LINES, type Mood } from './mascots';
import { weatherIcon, type WeatherIcon } from '../weatherTips';

/** El clima que la mascota puede comentar (lo mínimo de `WeatherNow`). */
export interface TalkWeather {
  temperature: number;
  code: number;
  isDay: boolean;
}

export interface TalkInput {
  mood: Mood;
  now: Date;
  weather: TalkWeather | null;
}

type Band = 'freezing' | 'cold' | 'cool' | 'mild' | 'warm' | 'hot' | 'scorching';

/** Franja de temperatura (°C). */
export const bandOf = (temperature: number): Band =>
  temperature <= 3 ? 'freezing' : temperature <= 10 ? 'cold' : temperature <= 16 ? 'cool' : temperature <= 23 ? 'mild' : temperature <= 29 ? 'warm' : temperature <= 34 ? 'hot' : 'scorching';

/** Frases por temperatura. `{temp}` se reemplaza por los grados. */
const BAND_LINES: Record<Band, string[]> = {
  freezing: ['{temp}° afuera: ni se te ocurra salir sin abrigo.', 'Con {temp}° hasta los bits tienen frío.', 'Hace un frío que pela: tomate algo calentito.'],
  cold: ['Hay {temp}°: abrigate si salís.', '{temp}° y yo acá, calentito frente a la pantalla.', 'Día de mate bien caliente: hay {temp}°.'],
  cool: ['Fresquito: {temp}°. Ideal para concentrarse.', '{temp}°: ni frío ni calor, productividad pura.', 'Con {temp}° se piensa mejor, dicen.'],
  mild: ['{temp}°: clima de diez, aprovechalo.', 'Qué agradable, {temp}°. Abrí la ventana un rato.', '{temp}° y todo en orden: así da gusto.'],
  warm: ['Ya se siente el calor: {temp}°.', '{temp}°: tomá agua, che.', 'Hay {temp}°; una limonada no vendría mal.'],
  hot: ['Hace calor, {temp}°. Hidratate.', '{temp}° afuera: el ventilador es tu mejor amigo.', 'Con {temp}° hasta el servidor transpira.'],
  scorching: ['{temp}°: esto es un horno. Agua y sombra.', 'Mucho calor, {temp}°: cuidate y tomá agua.', '{temp}° y yo derritiéndome frente al monitor.'],
};

const SKY_LINES: Partial<Record<WeatherIcon, string[]>> = {
  rain: ['Está lloviendo: llevate el paraguas.', 'Llueve afuera. Café y a programar.', 'Día de lluvia: el mejor para quedarse en el código.'],
  drizzle: ['Una llovizna fina por ahí. Ojo si salís.', 'Lloviznando… clima de mate.'],
  storm: ['Hay tormenta: si podés, quedate adentro.', 'Truenos afuera. Guardá los cambios por las dudas.'],
  snow: ['¡Nieva! Abrigate bien si salís.'],
  fog: ['Hay neblina: cuidado si manejás.'],
  sun: ['Hay un solcito lindo ahí afuera.', 'Día soleado: acordate de salir a tomar un poco de sol.'],
  moon: ['Noche despejada afuera.'],
  cloud: ['Cielo cubierto: día de pantalla y café.'],
  'cloud-sun': ['Algo nublado, con sol entre las nubes.'],
};

/** Frases según el momento del día (la hora). `{time}` = hora actual. */
const HOUR_LINES: Array<{ from: number; to: number; lines: string[] }> = [
  { from: 0, to: 5, lines: ['Son las {time}: ¿no deberías estar durmiendo?', 'A esta hora hasta los gatos duermen. {time}.', 'Madrugada de {time}: guardá todo y descansá.'] },
  { from: 5, to: 8, lines: ['Son las {time}: temprano, madrugador.', 'Recién arranca el día ({time}). ¿Mate?', 'Buen día. Las {time} y ya estás acá.'] },
  { from: 8, to: 12, lines: ['Mañana productiva: son las {time}.', 'Las {time}: el mejor momento para lo difícil.', 'Se viene el mediodía, aguantá un poco más.'] },
  { from: 12, to: 14, lines: ['Las {time}: ¿ya almorzaste?', 'Hora de comer algo. Los commits esperan.', 'Mediodía: despejá la cabeza un ratito.'] },
  { from: 14, to: 17, lines: ['Las {time}: la tarde recién empieza.', 'Tarde de laburo, son las {time}. Un mate ayuda.', 'Pasó el almuerzo y el sueño aprieta: ánimo.'] },
  { from: 17, to: 20, lines: ['Las {time}: se va acabando el día.', 'Hora de la merienda, ¿no?', 'Ya casi cerramos la jornada ({time}).'] },
  { from: 20, to: 24, lines: ['Son las {time}: ya está bien por hoy.', 'Noche: guardá los cambios y descansá.', 'A esta hora los mejores bugs aparecen. Mejor mañana.'] },
];

/** Frases según el día de la semana (0 = domingo). */
const WEEKDAY_LINES: Record<number, string[]> = {
  0: ['Domingo: ¿qué hacés acá?', 'Domingo de descanso. Yo también me hago el dormido.'],
  1: ['Lunes: arrancamos de a poco.', 'Es lunes, pero se puede. Un cafecito primero.'],
  2: ['Martes: ya agarraste ritmo.', 'Martes, la semana ya está en marcha.'],
  3: ['Miércoles: mitad de semana, ¡ya falta menos!', 'Estamos a mitad de camino: es miércoles.'],
  4: ['Jueves: casi, casi viernes.', 'Jueves: el viernes está a la vuelta.'],
  5: ['¡Viernes! Cuidado con deployar hoy.', 'Es viernes: último esfuerzo y a descansar.', 'Viernes: que el fin de semana te encuentre sin MRs abiertos.'],
  6: ['Sábado: descansá, el código espera.', 'Sábado y vos acá… ¡qué compromiso!'],
};

/** Frases de la fecha: primer día, fin de mes, quincena. */
const dateLines = (now: Date): string[] => {
  const day = now.getDate();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (day === 1) return ['Arrancó el mes: página en blanco.', 'Primero del mes: ¡a empezar con todo!'];
  if (day === last) return ['Último día del mes: ¿cerraste lo pendiente?', 'Fin de mes: revisá que no te quede nada colgado.'];
  if (day === 15) return ['Mitad de mes ya.'];
  return [];
};

const fill = (line: string, input: TalkInput): string =>
  line
    .replace('{temp}', input.weather ? String(Math.round(input.weather.temperature)) : '')
    .replace('{time}', `${String(input.now.getHours()).padStart(2, '0')}:${String(input.now.getMinutes()).padStart(2, '0')}`);

/**
 * Todas las frases que puede decir ahora: las de su ánimo y, aparte, las del momento (hora, día de la semana y fecha) y las del clima
 * (solo si el usuario activó el clima en el Inicio). Separadas para poder darles más chance a las del momento.
 */
export const talkPools = (input: TalkInput): { mood: string[]; moment: string[] } => {
  const { weather, now } = input;
  const hour = HOUR_LINES.find((range) => now.getHours() >= range.from && now.getHours() < range.to)?.lines ?? [];
  const sky = weather ? [...BAND_LINES[bandOf(weather.temperature)], ...(SKY_LINES[weatherIcon(weather.code, weather.isDay)] ?? [])] : [];
  const moment = [...hour, ...(WEEKDAY_LINES[now.getDay()] ?? []), ...dateLines(now), ...sky];
  return { mood: MOOD_LINES[input.mood].map((line) => fill(line, input)), moment: moment.map((line) => fill(line, input)) };
};

/** Probabilidad de que la frase sea del momento (hora, día, fecha, clima) y no de su ánimo. */
export const MOMENT_CHANCE = 0.6;

/** Elige una frase al azar sin repetir la anterior. */
export const pickTalk = (input: TalkInput, rng: () => number = Math.random, last: string | null = null): string => {
  const pools = talkPools(input);
  const preferMoment = pools.moment.length > 0 && rng() < MOMENT_CHANCE;
  const pool = (preferMoment ? pools.moment : pools.mood).filter((line) => line !== last);
  const fallback = pools.mood.filter((line) => line !== last);
  const source = pool.length ? pool : fallback.length ? fallback : pools.mood;
  return source[Math.min(source.length - 1, Math.floor(rng() * source.length))]!;
};
