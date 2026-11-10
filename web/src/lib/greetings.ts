/**
 * Frases del Inicio: un saludo simpático según la hora (y a veces el día), algunas con el nombre configurado. Si no hay
 * nombre, solo se usan las frases que no lo llevan.
 */
export type Slot = 'madrugada' | 'amanecer' | 'manana' | 'mediodia' | 'tarde' | 'noche';

interface Phrase {
  text: string;
  /** Lleva `{name}`: solo se usa si el usuario configuró su nombre. */
  named?: boolean;
}

/** `madrugada` (0 a 5) es de quien no durmió; `amanecer` (5 a 7) es de quien empezó muy temprano: no se le dice que no durmió. */
export const slotOf = (hour: number): Slot => (hour < 5 ? 'madrugada' : hour < 7 ? 'amanecer' : hour < 12 ? 'manana' : hour < 14 ? 'mediodia' : hour < 20 ? 'tarde' : 'noche');

export const PHRASES: Record<Slot, Phrase[]> = {
  madrugada: [
    { text: '¿Todavía despierto? El compilador también te extraña.' },
    { text: 'Hora de los commits heroicos (y de los arrepentimientos de mañana).' },
    { text: 'A esta hora hasta los servicios duermen. Vos no, {name}.', named: true },
    { text: '{name}, ¿seguro que esto no puede esperar a la mañana?', named: true },
    { text: 'Madrugada productiva: nadie te manda mails ni reuniones.' },
    { text: 'Te están volviendo loco ¿no?' },
    { text: 'Prometo no juzgar tus commits de las 3 de la mañana, {name}.', named: true },
    { text: 'Si compila a esta hora, desconfiá.' },
    { text: '{name}, el sueño también es una dependencia crítica.', named: true },
    { text: 'Un commit más y duermo. (Mentira, siempre es uno más.)' },
  ],
  amanecer: [
    { text: 'Arranque temprano: a esta hora nadie te interrumpe.' },
    { text: 'Buen día, {name}. Las primeras horas son las más tranquilas del día.', named: true },
    { text: 'Madrugar tiene premio: silencio, café y cero reuniones.' },
    { text: 'Empezaste temprano: acordate de cortar temprano también.' },
    { text: '{name}, qué temprano arrancás. Que el café te acompañe.', named: true },
    { text: 'Las primeras horas rinden el doble. Aprovechalas, sin pasarte.' },
    { text: 'Amaneciendo: hora ideal para el ticket que pide concentración.' },
    { text: 'Todavía no hay mails ni chats. Es tu mejor momento para avanzar.' },
  ],
  manana: [
    { text: '¡Buen día! El café ya debería estar haciendo efecto.' },
    { text: 'Buen día, {name}. Hoy los tests están de buen humor (creo).', named: true },
    { text: 'Arrancamos la jornada: cero tickets, infinitas posibilidades.' },
    { text: '¡Arriba, {name}! Los tests no se escriben solos… bueno más o menos.', named: true },
    { text: 'Buenos días. Primero el café, después el git pull.' },
    { text: 'Buen día, {name}. Que los merges sean livianos y los conflictos, pocos.', named: true },
    { text: 'Mañana fresca, ramas limpias. Así da gusto.' },
    { text: 'Cero reuniones, cero bugs. Prometido hasta que se demuestre lo contrario.' },
    { text: 'Buen día, {name}. Hoy toca ser productivo, o por lo menos parecerlo.', named: true },
    { text: 'El primer café compila, el segundo despliega.' },
  ],
  mediodia: [
    { text: 'Hora del almuerzo: los bugs también esperan.' },
    { text: '{name}, ¿ya almorzaste? Un dev con hambre hace commits raros.', named: true },
    { text: 'Mediodía: buen momento para estirar las piernas y no mirar la pantalla un rato.' },
    { text: 'Pausa merecida, {name}. El panel te cuida las espaldas.', named: true },
    { text: 'Si el código no compila a esta hora, probablemente sea hambre.' },
    { text: 'Los deploys del mediodía son como las milanesas: mejor no improvisar.' },
    { text: 'Buen provecho, {name}. El merge te espera cuando vuelvas.', named: true },
  ],
  tarde: [
    { text: 'Buenas tardes. A este ritmo el ticket se cierra solo.' },
    { text: 'Buenas tardes, {name}. Ese merge no se resuelve solo.', named: true },
    { text: 'Tarde de foco: silenciá las notificaciones y a darle.' },
    { text: 'Vamos, {name}, que el deploy de las 18 no se prueba solo.', named: true },
    { text: 'Lo difícil ya pasó. (Esta frase no tiene respaldo técnico.)' },
    { text: 'Buenas tardes, {name}. Un último esfuerzo y a cerrar tickets.', named: true },
    { text: 'La tarde es larga, pero el historial de git es más largo.' },
    { text: 'A esta hora el café ya es una decisión de arquitectura.' },
    { text: '{name}, un ticket cerrado vale más que cinco a medias.', named: true },
    { text: 'Tarde de merges: respirá hondo antes de resolver conflictos.' },
  ],
  noche: [
    { text: 'Buenas noches. Hasta el panel baja el brillo.' },
    { text: 'Buenas noches, {name}. ¿Ya marcaste la salida?', named: true },
    { text: 'Modo noche activado: menos estrés, más commits chiquitos.' },
    { text: '{name}, lo que no está commiteado a esta hora, {tomorrow} será otro problema.', named: true },
    { text: 'Cerrá la jornada con un buen mensaje de commit. Tu yo del futuro lo agradece.' },
    { text: 'Noche tranquila: sin alertas rojas, sin rebases pendientes (ojalá).' },
    { text: 'Ya se te pasó la hora ¿vamos cerrando?' },
    { text: 'El que commitea de noche, rebasa de mañana.' },
    { text: 'Buenas noches, {name}. Dejá el panel prendido, yo me encargo de acordarme.', named: true },
    { text: 'Apagá el monitor, que el código no se va a escapar.' },
  ],
};

/** Frases sobre programar con Claude (y la IA en general), algunas pasivo-agresivas. Salen a cualquier hora del día. */
export const AI_PHRASES: Phrase[] = [
  { text: 'Claude se encarga. Vos mirá, aprobá y llevate el crédito.' },
  { text: '{name}, ¿lo escribiste vos o lo escribió Claude? No juzgo. Mucho.', named: true },
  { text: 'Hoy el código lo escribe Claude; vos ponés el café y la cara en la review.' },
  { text: 'Dicen que la IA te va a reemplazar. Por ahora solo te reemplazó los commits.' },
  { text: 'Programar con Claude: 5 minutos de código, 3 horas de "esto no lo pedí".' },
  { text: '{name}, un día más de "arreglalo" con tono amable para que Claudio no se ofenda (¿no?).', named: true },
  { text: 'Si Claude lo hizo bien, fue tu prompt. Si lo hizo mal, todavía no te puede reemplazar.' },
  { text: 'Claudio no se cansa, no pide vacaciones y no pregunta por qué el ticket es "urgente". Todavía.' },
  { text: '{name}, qué lindo que "dirigís" el desarrollo mientras Claude tipea.', named: true },
  { text: 'Tranquilo, la IA no te va a quitar el trabajo: alguien tiene que explicarle al señor oscuro.' },
  { text: 'Recordatorio: "lo hizo Claude" no es una buena respuesta en la daily.' },
  { text: 'Antes se rompía el código a mano, con orgullo. Ahora se rompe en equipo con Claude.' },
  { text: 'Pedirle algo a Claude con amabilidad no mejora el resultado, pero te deja la conciencia tranquila.' },
  { text: '{name}, ¿leíste el diff completo o le diste "aprobar" por cansancio?', named: true },
  { text: 'El futuro es hermoso: un humano que escribe prompts y una IA que escribe disculpas.' },
  { text: 'Claudio dice que ya terminó. Verificá. Siempre verificá.' },
  { text: 'Hoy vas a decir "perfecto, gracias" a una máquina al menos diez veces. Es normal.' },
];

/**
 * Horarios en los que el dev debería estar durmiendo (o recién levantándose): frases propias para cada rango, `desde` incluido
 * y `hasta` excluido. Pesan el doble que las de la franja general.
 */
export const ODD_HOUR_PHRASES: Array<{ from: number; to: number; phrases: Phrase[] }> = [
  {
    from: 22,
    to: 24,
    phrases: [
      { text: 'Son más de las 10 de la noche. El ticket no se va a ofender si lo dejás para {tomorrow}.' },
      { text: '{name}, a esta hora hasta los servicios en producción están por irse a dormir.', named: true },
      { text: 'Horario extra: lo que hagas ahora no figura en ningún sprint.' },
      { text: 'Cena, ducha, cama. El deploy puede esperar a la mañana.' },
    ],
  },
  {
    from: 0,
    to: 2,
    phrases: [
      { text: 'Pasó la medianoche. Los commits de ahora se leen distinto a la mañana.' },
      { text: '{name}, es tardísimo. Guardá, commiteá y a dormir.', named: true },
      { text: 'Medianoche: la hora en que "un cambio chiquito" se convierte en tres horas.' },
      { text: 'A esta hora el único que trabaja es el cron. Y vos, aparentemente.' },
      { text: 'Si estás acá por un incidente, suerte. Si no, andá a dormir.' },
    ],
  },
  {
    from: 2,
    to: 4,
    phrases: [
      { text: 'Son las 2 pasadas. Ni redmine debe estar andando.' },
      { text: '{name}, a esta hora tu cama te extraña más que el repo.', named: true },
      { text: 'Esto ya no es un horario de trabajo, es una decisión de vida.' },
      { text: 'Cerca de las 3 de la mañana: el momento en que el bug se vuelve filosófico.' },
      { text: 'Nadie va a leer este commit hasta las 9. Dormí.' },
      { text: '{name}, en serio: el café no es un sustituto del sueño.', named: true },
    ],
  },
  {
    from: 4,
    to: 5,
    phrases: [
      { text: 'Las 4: o madrugaste muchísimo o nunca te fuiste a dormir.' },
      { text: '{name}, ya casi amanece. Dormir ahora es como un rollback pero con culpa.', named: true },
      { text: 'Si seguís despierto desde ayer, esto ya cuenta como guardia.' },
      { text: 'Amanece en un rato. Los pájaros ya empezaron el standup.' },
      { text: 'A esta hora el sol todavía no entró al proyecto.' },
    ],
  },
  {
    // A partir de las 5 se asume que empezó muy temprano (no que no durmió)
    from: 5,
    to: 7,
    phrases: [
      { text: 'Madrugador: ni el café está listo todavía.' },
      { text: '{name}, qué temprano. El resto del equipo recién está apagando la alarma.', named: true },
      { text: 'Antes de las 7 no hay reuniones, ni mails, ni excusas.' },
      { text: '{name}, ¿a esta hora ya marcás?', named: true },
      { text: 'Si arrancaste temprano, la tarde es tuya: planificá cortar a horario.' },
      { text: 'Primera hora del día: el mejor momento para lo que pide concentración.' },
    ],
  },
];

/** Extras según el día de la semana (0 = domingo). */
export const DAY_PHRASES: Record<number, Phrase[]> = {
  1: [{ text: 'Lunes: respiremos hondo y vayamos de a un ticket por vez.' }, { text: 'Lunes: la daily de ayer sigue en pie, el café también.' }, { text: 'Lunes, {name}. Todavía hay tiempo de fingir que el finde fue largo.', named: true }],
  5: [{ text: 'Viernes: prohibido hacer deploy. (ojalá)' }, { text: '¡Viernes, {name}! Que los tests pasen y el finde llegue sin incidentes.', named: true }],
  6: [{ text: 'Sábado de guardia: el panel te acompaña.' }, { text: 'Sábado, {name}. Si estás acá, algo importante se rompió.', named: true }],
  0: [{ text: 'Domingo de código: ¿seguro que no preferís descansar?' }, { text: 'Domingo, {name}. Lo que se rompa hoy, se arregla {tomorrow}... o el mes que viene.', named: true }],
};

import { minutesSince } from './workday';

/** Dónde estás respecto de tu jornada (entrada y salida de la configuración). Solo días de semana y con horario cargado. */
export type WorkdayPhase = 'beforeEntry' | 'entryPending' | 'lastHour' | 'afterExit' | 'afterExitHours' | 'longAfter';

/**
 * La fase de la jornada, o `null` si no hay nada que decir (fin de semana, sin horarios, o en medio del día).
 *  - `beforeEntry`: falta entre 15 min y 4 h para la entrada;
 *  - `entryPending`: de 15 min antes a 2 h después de la entrada y todavía no marcaste entrada;
 *  - `lastHour`: la última hora antes de la salida;
 *  - `afterExit` / `afterExitHours`: ya pasó la salida (la segunda, si todavía no cargaste las horas);
 *  - `longAfter`: 3 h o más después de la salida.
 */
export const workdayPhase = (now: Date, workday: { entry: string; exit: string }, done: { entry: boolean; hours: boolean }): WorkdayPhase | null => {
  const sinceExit = minutesSince(workday.exit, now);
  if (sinceExit !== null) {
    if (sinceExit >= 180) return 'longAfter';
    if (sinceExit >= 0) return done.hours ? 'afterExit' : 'afterExitHours';
    if (sinceExit >= -60) return 'lastHour';
  }
  const sinceEntry = minutesSince(workday.entry, now);
  if (sinceEntry !== null) {
    if (sinceEntry >= -15 && sinceEntry <= 120 && !done.entry) return 'entryPending';
    if (sinceEntry < -15 && sinceEntry >= -240) return 'beforeEntry';
  }
  return null;
};

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const isoOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Cuándo se vuelve a trabajar, para las frases que dicen «mañana»: «mañana» si mañana es día hábil; si no (sábado, domingo o feriado),
 * el próximo día hábil con su nombre: «el lunes», «el martes»… `offDays` son los feriados que no se trabajan (AAAA-MM-DD).
 */
export const nextWorkdayLabel = (date: Date, offDays: string[] = []): string => {
  for (let ahead = 1; ahead <= 14; ahead += 1) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + ahead);
    if (day.getDay() === 0 || day.getDay() === 6 || offDays.includes(isoOf(day))) continue;
    return ahead === 1 ? 'mañana' : `el ${WEEKDAYS[day.getDay()]}`;
  }
  return 'mañana';
};

/** Lo que el Inicio sabe de hoy y puede mencionar en el saludo (viene de los avisos del día). */
export interface GreetingContext {
  /** Próximos feriados que no se trabajan (AAAA-MM-DD): las frases que dicen «mañana» pasan a «el martes», etc. */
  offDays?: string[];
  /** Nombre del feriado de hoy, si hoy es feriado. */
  holiday?: string | null;
  /** Cantidad de avisos importantes (comentarios nuevos, vencimientos de hoy o mañana, MRs con problemas…). */
  important?: number;
  /** Tickets que vencen hoy o mañana, o ya vencidos. */
  dueSoon?: number;
  /** Comentarios nuevos de otras personas en tus tickets. */
  reviews?: number;
  /** Hoy es el último día del sprint con trabajo pendiente. */
  sprintLastDay?: boolean;
  /** MRs con conflicto o pipeline caído. */
  mrProblems?: number;
  /** Dónde estás respecto de tu jornada (ver `workdayPhase`). */
  workday?: WorkdayPhase | null;
}

/** Frases según tu jornada: cuidan al desarrollador sin ser obvias. Pesan más que las generales cuando aplican. */
export const WORKDAY_PHRASES: Record<WorkdayPhase, Phrase[]> = {
  beforeEntry: [
    { text: 'Todavía no empieza tu jornada: tomate el café sin apuro.' },
    { text: '{name}, hay tiempo. Un buen arranque vale más que un arranque temprano.', named: true },
    { text: 'Falta un rato para entrar. Ordená las ideas, que los tickets esperan.' },
    { text: 'Aprovechá estos minutos: el día se pone mejor cuando arrancás con calma.' },
  ],
  entryPending: [
    { text: 'Ya es hora de entrar: no te olvides de marcar, que después te lo cobran.' },
    { text: '{name}, ¿marcaste la entrada? Mejor ahora que cuando te acuerdes a las 5.', named: true },
    { text: 'Primero marcar, después los commits. El orden importa.' },
    { text: 'Arrancó tu jornada. Un tilde en "Marcar entrada" y listo.' },
  ],
  lastHour: [
    { text: 'Queda poco para la salida: nada de empezar cosas nuevas ahora.' },
    { text: '{name}, última hora de la jornada. Cerrá lo que puedas y dejá notas para {tomorrow}.', named: true },
    { text: 'Falta poco para salir: un buen commit y una buena nota valen más que un parche apurado.' },
    { text: 'Última hora: si algo no entra hoy, que entre ordenado {tomorrow}.' },
  ],
  afterExit: [
    { text: 'Tu jornada ya terminó. Lo que hiciste hoy alcanza, {name}.', named: true },
    { text: 'Ya pasó tu horario de salida. El código también descansa.' },
    { text: 'Fin de jornada: cerrá la laptop sin culpa.' },
    { text: 'Hora de salir. {Tomorrow} vas a ver los problemas con otros ojos.' },
  ],
  afterExitHours: [
    { text: 'Ya podrías ir cerrando. ¿Cargaste las horas?' },
    { text: '{name}, terminó tu jornada: cargá las horas y desconectá.', named: true },
    { text: 'Antes de irte, las horas: dos minutos y te olvidás hasta {tomorrow}.' },
    { text: 'Pasó tu horario de salida y las horas siguen sin cargar. Cerrá el día así.' },
  ],
  longAfter: [
    { text: '{name}, ya hace rato que terminó tu jornada. Lo que falte puede esperar.', named: true },
    { text: 'Pasaron horas de tu salida. Descansar también es parte del trabajo.' },
    { text: 'Si no es urgente de verdad, {tomorrow} lo resolvés con la cabeza fresca.' },
    { text: 'Ya es tarde para tu jornada: cuidate, que el sprint no se va a ir a ningún lado.' },
  ],
};

/** Frases de un feriado: reemplazan a las del día (hoy no se labura… o no debería). `{holiday}` es el nombre del feriado. */
export const HOLIDAY_PHRASES: Phrase[] = [
  { text: 'Hoy es feriado ({holiday}). Si estás acá, algo te pesa en la conciencia.' },
  { text: '{name}, es feriado. El panel te perdona, pero tu descanso no.', named: true },
  { text: 'Feriado: {holiday}. Los tickets pueden esperar, los asados no.' },
  { text: 'Hoy no se compila: {holiday}. Aprovechá.' },
  { text: '{name}, ¿trabajando en feriado? Dejá el mouse y andá a descansar.', named: true },
  { text: 'Día no laborable. El único deploy que corresponde hoy es el de la siesta.' },
  { text: 'Feriado de {holiday}: si el build falla, que falle {tomorrow}.' },
  { text: '{name}, descansá: el sprint no se va a achicar por un feriado… ¿o sí?', named: true },
];

/** Frases que mencionan algo real que conviene mirar. Se suman al pool cuando corresponde. `{avisos}` es "1 aviso importante" / "3 avisos importantes". */
export const ATTENTION_PHRASES: Record<'important' | 'dueSoon' | 'reviews' | 'sprintLastDay' | 'mrProblems', Phrase[]> = {
  important: [
    { text: 'Ojo: hoy hay {avisos} en "Para tener en cuenta".' },
    { text: '{name}, mirá los avisos de abajo antes de arrancar: tenés {avisos}.', named: true },
    { text: 'Tenés {avisos} esperándote. Primero eso, después el café.' },
  ],
  dueSoon: [
    { text: 'Hay un ticket que vence pronto: conviene no dejarlo para después.' },
    { text: '{name}, un vencimiento anda cerca. Revisá el aviso de abajo.', named: true },
    { text: 'La fecha de entrega no espera: mirá qué vence hoy o mañana.' },
  ],
  reviews: [
    { text: 'Te dejaron comentarios en tus tickets: leelos antes de seguir.' },
    { text: '{name}, hay comentarios nuevos en tus tickets. Alguien leyó tu trabajo.', named: true },
    { text: 'Revisión nueva a la vista. Todo bien, probablemente.' },
  ],
  sprintLastDay: [
    { text: 'Último día del sprint con cosas pendientes: hoy se define.' },
    { text: '{name}, hoy cierra el sprint. Lo que no esté en Revisión, ya es del próximo.', named: true },
  ],
  mrProblems: [
    { text: 'Hay un MR con conflicto o pipeline caído esperando que lo mires.' },
    { text: '{name}, algún MR se ensució. Mirá los avisos antes de que se enfríe.', named: true },
  ],
};

/** Rellena las marcas de una frase (`{name}`, `{tomorrow}`, `{holiday}`…). */
const fillerFor = (date: Date, name: string, offDays?: string[]) => {
  const tomorrow = nextWorkdayLabel(date, offDays);
  return (phrase: Phrase, extra: Record<string, string> = {}): string =>
    Object.entries({ ...extra, tomorrow, Tomorrow: `${tomorrow.charAt(0).toUpperCase()}${tomorrow.slice(1)}` })
      .reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), phrase.text)
      .replace(/\{name\}/g, name.trim());
};

/**
 * Las frases graciosas (no las de saludo) para los avisos espontáneos: las de programar con Claude y, en horarios raros, las de
 * cada rango. Con o sin nombre, ya rellenadas.
 */
export const funnyPool = (date: Date, name: string, offDays: string[] = []): string[] => {
  const hasName = name.trim().length > 0;
  const fill = fillerFor(date, name, offDays);
  const hour = date.getHours();
  const odd = ODD_HOUR_PHRASES.filter((range) => hour >= range.from && hour < range.to).flatMap((range) => range.phrases);
  return [...AI_PHRASES, ...odd].filter((phrase) => !phrase.named || hasName).map((phrase) => fill(phrase));
};

/** Las frases posibles para esa hora, día y situación, con o sin nombre. */
export const poolFor = (date: Date, name: string, context: GreetingContext = {}): string[] => {
  const hasName = name.trim().length > 0;
  const fill = fillerFor(date, name, context.offDays);
  const usable = (phrases: Phrase[]) => phrases.filter((phrase) => !phrase.named || hasName);

  // Un feriado manda: hoy el saludo es de feriado.
  if (context.holiday) return usable(HOLIDAY_PHRASES).map((phrase) => fill(phrase, { holiday: context.holiday! }));

  const important = context.important ?? 0;
  const attention: string[] = [
    ...(important > 0 ? usable(ATTENTION_PHRASES.important).map((phrase) => fill(phrase, { avisos: `${important} ${important === 1 ? 'aviso importante' : 'avisos importantes'}` })) : []),
    ...((context.dueSoon ?? 0) > 0 ? usable(ATTENTION_PHRASES.dueSoon).map((phrase) => fill(phrase)) : []),
    ...((context.reviews ?? 0) > 0 ? usable(ATTENTION_PHRASES.reviews).map((phrase) => fill(phrase)) : []),
    ...(context.sprintLastDay ? usable(ATTENTION_PHRASES.sprintLastDay).map((phrase) => fill(phrase)) : []),
    ...((context.mrProblems ?? 0) > 0 ? usable(ATTENTION_PHRASES.mrProblems).map((phrase) => fill(phrase)) : []),
  ];
  // Tu jornada: pesan el triple, más que los avisos (cuidar al desarrollador antes que apurarlo).
  const workday = context.workday ? usable(WORKDAY_PHRASES[context.workday]).map((phrase) => fill(phrase)) : [];
  const hour = date.getHours();
  const odd = usable(ODD_HOUR_PHRASES.filter((range) => hour >= range.from && hour < range.to).flatMap((range) => range.phrases)).map((phrase) => fill(phrase));
  const regular = [...usable([...PHRASES[slotOf(hour)], ...(DAY_PHRASES[date.getDay()] ?? []), ...AI_PHRASES]).map((phrase) => fill(phrase)), ...odd, ...odd];
  // Cuando hay algo que mirar, las frases que lo mencionan pesan más (se repiten) pero no desplazan del todo a las simpáticas.
  return [...regular, ...attention, ...attention, ...workday, ...workday, ...workday];
};

/** Una frase al azar (distinta de la última que se mostró, si hay otra). */
export const pickGreeting = (date: Date, name: string, random: () => number = Math.random, last?: string | null, context: GreetingContext = {}): string => {
  const pool = poolFor(date, name, context);
  const options = pool.length > 1 ? pool.filter((text) => text !== last) : pool;
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))] ?? '';
};

/** El contexto del saludo a partir de los avisos del día (ver `HomeNotice`). */
export const contextFromNotices = (notices: Array<{ id: string; kind: string; level: string; title: string }>, todayIso: string): GreetingContext => {
  const holiday = notices.find((notice) => notice.id === `holiday-${todayIso}` && notice.title.startsWith('Hoy es feriado'));
  return {
    holiday: holiday ? holiday.title.replace(/^Hoy es feriado:\s*/, '') : null,
    important: notices.filter((notice) => notice.level === 'important').length,
    dueSoon: notices.filter((notice) => notice.kind === 'due' && notice.level === 'important').length,
    reviews: notices.filter((notice) => notice.kind === 'review').length,
    sprintLastDay: notices.some((notice) => notice.kind === 'sprint' && notice.level === 'important'),
    mrProblems: notices.filter((notice) => notice.kind === 'mr' && notice.level === 'important' && !notice.id.startsWith('mr-notes-')).length,
  };
};
