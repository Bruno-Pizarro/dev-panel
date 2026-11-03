/**
 * Frases del Inicio: un saludo simpático según la hora (y a veces el día), algunas con el nombre configurado. Si no hay
 * nombre, solo se usan las frases que no lo llevan.
 */
export type Slot = 'madrugada' | 'manana' | 'mediodia' | 'tarde' | 'noche';

interface Phrase {
  text: string;
  /** Lleva `{name}`: solo se usa si el usuario configuró su nombre. */
  named?: boolean;
}

export const slotOf = (hour: number): Slot => (hour < 6 ? 'madrugada' : hour < 12 ? 'manana' : hour < 14 ? 'mediodia' : hour < 20 ? 'tarde' : 'noche');

export const PHRASES: Record<Slot, Phrase[]> = {
  madrugada: [
    { text: '¿Todavía despierto? El compilador también te extraña.' },
    { text: 'Hora de los commits heroicos (y de los arrepentimientos de mañana).' },
    { text: 'A esta hora hasta los servicios duermen. Vos no, {name}.', named: true },
    { text: '{name}, ¿seguro que esto no puede esperar a la mañana?', named: true },
    { text: 'Madrugada productiva: nadie te manda mails ni reuniones.' },
    { text: 'Prometo no juzgar tus commits de las 3 de la mañana, {name}.', named: true },
  ],
  manana: [
    { text: '¡Buen día! El café ya debería estar haciendo efecto.' },
    { text: 'Buen día, {name}. Hoy los tests están de buen humor (creo).', named: true },
    { text: 'Arrancamos la jornada: cero tickets, infinitas posibilidades.' },
    { text: '¡Arriba, {name}! Los tests no se escriben solos… todavía.', named: true },
    { text: 'Buenos días. Primero el café, después el git pull.' },
    { text: 'Buen día, {name}. Que los merges sean livianos y los conflictos, pocos.', named: true },
    { text: 'Mañana fresca, ramas limpias. Así da gusto.' },
  ],
  mediodia: [
    { text: 'Hora del almuerzo: los bugs también esperan.' },
    { text: '{name}, ¿ya almorzaste? Un dev con hambre hace commits raros.', named: true },
    { text: 'Mediodía: buen momento para estirar las piernas y no mirar la pantalla un rato.' },
    { text: 'Pausa merecida, {name}. El panel te cuida las espaldas.', named: true },
    { text: 'Si el código no compila a esta hora, probablemente sea hambre.' },
  ],
  tarde: [
    { text: 'Buenas tardes. A este ritmo el ticket se cierra solo.' },
    { text: 'Buenas tardes, {name}. Ese merge no se resuelve solo.', named: true },
    { text: 'Tarde de foco: silenciá las notificaciones y a darle.' },
    { text: 'Vamos, {name}, que el deploy de las 18 no se prueba solo.', named: true },
    { text: 'Lo difícil ya pasó. (Esta frase no tiene respaldo técnico.)' },
    { text: 'Buenas tardes, {name}. Un último esfuerzo y a cerrar tickets.', named: true },
    { text: 'La tarde es larga, pero el historial de git es más largo.' },
  ],
  noche: [
    { text: 'Buenas noches. Hasta el panel baja el brillo.' },
    { text: 'Buenas noches, {name}. ¿Ya marcaste la salida?', named: true },
    { text: 'Modo noche activado: menos estrés, más commits chiquitos.' },
    { text: '{name}, lo que no está commiteado a esta hora, mañana será otro problema.', named: true },
    { text: 'Cerrá la jornada con un buen mensaje de commit. Tu yo del futuro lo agradece.' },
    { text: 'Noche tranquila: sin alertas rojas, sin rebases pendientes (ojalá).' },
  ],
};

/** Extras según el día de la semana (0 = domingo). */
export const DAY_PHRASES: Record<number, Phrase[]> = {
  1: [{ text: 'Lunes: respiremos hondo y vayamos de a un ticket por vez.' }, { text: 'Lunes, {name}. Todavía hay tiempo de fingir que el finde fue largo.', named: true }],
  5: [{ text: 'Viernes: prohibido hacer deploy. (Es broma… o no.)' }, { text: '¡Viernes, {name}! Que los tests pasen y el finde llegue sin incidentes.', named: true }],
  6: [{ text: 'Sábado de guardia: el panel te acompaña.' }],
  0: [{ text: 'Domingo de código: ¿seguro que no preferís descansar?' }, { text: 'Domingo, {name}. Lo que se rompa hoy, se arregla mañana.', named: true }],
};

/** Las frases posibles para esa hora y día, con o sin nombre. */
export const poolFor = (date: Date, name: string): string[] => {
  const hasName = name.trim().length > 0;
  return [...PHRASES[slotOf(date.getHours())], ...(DAY_PHRASES[date.getDay()] ?? [])]
    .filter((phrase) => !phrase.named || hasName)
    .map((phrase) => phrase.text.replace(/\{name\}/g, name.trim()));
};

/** Una frase al azar (distinta de la última que se mostró, si hay otra). */
export const pickGreeting = (date: Date, name: string, random: () => number = Math.random, last?: string | null): string => {
  const pool = poolFor(date, name);
  const options = pool.length > 1 ? pool.filter((text) => text !== last) : pool;
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))] ?? '';
};
