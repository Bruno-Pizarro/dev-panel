import { MASCOTS } from './mascots';
import { commitStreak } from './records';
import { daysBetween } from './streaks';
import type { GameState, RewardFacts } from './types';

/** Todo lo que un logro puede mirar para decidir si se gana. */
export interface Ctx {
  facts: RewardFacts;
  state: GameState;
  /** La hora de esta máquina. */
  now: Date;
  /** Los logros diarios que ya se ganaron hoy. */
  earnedToday: string[];
}

/** Qué tan difícil es: se nota en la vitrina y en cómo se festeja. */
export type Tier = 'comun' | 'raro' | 'epico' | 'legendario';
export const TIER_LABEL: Record<Tier, string> = { comun: 'común', raro: 'raro', epico: 'épico', legendario: 'legendario' };

export interface Achievement {
  id: string;
  name: string;
  /** La gracia: qué hay que hacer, dicho con humor. */
  desc: string;
  emoji: string;
  /** `daily`: se puede ganar todos los días. `lifetime`: una sola vez. */
  kind: 'daily' | 'lifetime';
  /** Secreto: no se ve en la vitrina hasta ganarlo. */
  secret?: boolean;
  tier: Tier;
  test: (ctx: Ctx) => boolean;
}

type Raw = Omit<Achievement, 'tier'>;

const minutes = (time: string | null): number | null => {
  const match = time ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const exitMinutes = (facts: RewardFacts): number => minutes(facts.workday.exit) ?? 18 * 60;
const clock = (now: Date) => now.getHours() * 60 + now.getMinutes();
const firstBefore = (facts: RewardFacts, limit: number) => (minutes(facts.commits.firstToday) ?? 9999) < limit;
const lastAfter = (facts: RewardFacts, limit: number) => (minutes(facts.commits.lastToday) ?? -1) >= limit;
const allDone = (facts: RewardFacts) => facts.checklist.total > 0 && facts.checklist.done === facts.checklist.total;
const total = (state: GameState, key: 'agents' | 'commits' | 'activeDays' | 'checklistDays' | 'recordsBroken') => state.counters[key];
const flag = (state: GameState, key: string) => Boolean(state.flags[key]);

const RAW: Raw[] = [
  // ---------------------------------------------------------------- diarios: se ganan todos los días
  { id: 'rompehielo', name: 'Rompehielo', emoji: '🧊', kind: 'daily', desc: 'Hiciste el primer commit del día. El primero siempre es el que más cuesta.', test: ({ facts }) => facts.commits.today >= 1 },
  { id: 'madrugador', name: 'Madrugador', emoji: '🌅', kind: 'daily', desc: 'Commit antes de las 8:00. El que madruga, mergea.', test: ({ facts }) => firstBefore(facts, 8 * 60) && facts.commits.today >= 1 },
  { id: 'trio-dinamico', name: 'Trío dinámico', emoji: '🎯', kind: 'daily', desc: 'Tres commits en el día. Como las buenas bandas.', test: ({ facts }) => facts.commits.today >= 3 },
  { id: 'mano-de-cinco', name: 'Mano de cinco', emoji: '🖐️', kind: 'daily', desc: 'Cinco commits hoy. Chocá esos cinco.', test: ({ facts }) => facts.commits.today >= 5 },
  { id: 'ametralladora', name: 'Ametralladora', emoji: '🔫', kind: 'daily', desc: 'Diez commits en un día. Que alguien le avise a git que estás en racha.', test: ({ facts }) => facts.commits.today >= 10 },
  { id: 'director-de-orquesta', name: 'Director de orquesta', emoji: '🎼', kind: 'daily', desc: 'Tres agentes trabajando a la vez. Vos levantás la batuta.', test: ({ facts }) => facts.agents.maxParallelToday >= 3 },
  { id: 'jefe-de-planta', name: 'Jefe de planta', emoji: '🏭', kind: 'daily', desc: 'Cinco agentes en paralelo. Esto ya es una fábrica.', test: ({ facts }) => facts.agents.maxParallelToday >= 5 },
  { id: 'rebano-digital', name: 'Rebaño digital', emoji: '🐑', kind: 'daily', desc: 'Lanzaste diez agentes en el día. ¿Quién cuenta ovejas ahora?', test: ({ facts }) => facts.agents.today >= 10 },
  { id: 'tres-modelos', name: 'Equipo completo', emoji: '🧠', kind: 'daily', desc: 'Usaste opus, sonnet y haiku el mismo día. Un poco de cada familia.', test: ({ facts }) => ['opus', 'sonnet', 'haiku'].every((model) => facts.agents.modelsToday.includes(model)) },
  { id: 'quemador-de-tokens', name: 'Quemador de tokens', emoji: '🔥', kind: 'daily', desc: 'Más de un millón de tokens hoy. El plan fijo te lo agradece (o no).', test: ({ facts }) => facts.agents.tokensToday >= 1_000_000 },
  { id: 'dia-completo', name: 'Día completo', emoji: '✅', kind: 'daily', desc: 'Todo el checklist del día tildado. Eso es tener la vida ordenada.', test: ({ facts }) => allDone(facts) },
  { id: 'escriba', name: 'Escriba', emoji: '📝', kind: 'daily', desc: 'Cargaste las notas del día. La memoria del equipo te lo agradece.', test: ({ facts }) => facts.checklist.items['cargar-notas'] === true },
  { id: 'contador', name: 'Contador', emoji: '🧮', kind: 'daily', desc: 'Horas cargadas. Que ni Redmine se queje.', test: ({ facts }) => facts.checklist.items['cargar-horas'] === true },
  { id: 'escritorio-ordenado', name: 'Escritorio ordenado', emoji: '🧹', kind: 'daily', desc: 'Cerrás el día con todo commiteado y pusheado. Prolijidad extrema.', test: ({ facts, now }) => clock(now) >= exitMinutes(facts) - 30 && facts.commits.today >= 1 && facts.repos.dirty === 0 && facts.repos.unpushed === 0 },
  { id: 'malabarista', name: 'Malabarista', emoji: '🤹', kind: 'daily', desc: 'Commits en dos tickets distintos el mismo día. No se te cae ninguno.', test: ({ facts }) => facts.ticketsToday.length >= 2 },
  { id: 'entorno-sano', name: 'Entorno sano', emoji: '🌱', kind: 'daily', desc: 'Todos los servicios obligatorios arriba. Un milagro de Docker.', test: ({ facts }) => facts.services !== null && facts.services.total > 0 && facts.services.running === facts.services.total },
  { id: 'lunes-valiente', name: 'Lunes valiente', emoji: '🦁', kind: 'daily', desc: 'Commit un lunes antes de las 10:00. Eso es coraje.', test: ({ facts }) => facts.weekday === 1 && firstBefore(facts, 10 * 60) && facts.commits.today >= 1 },
  { id: 'viernes-de-cierre', name: 'Viernes de cierre', emoji: '🎉', kind: 'daily', desc: 'Checklist completo un viernes. Te vas liviano.', test: ({ facts }) => facts.weekday === 5 && allDone(facts) },
  { id: 'commit-con-milanesa', name: 'Commit con milanesa', emoji: '🥩', kind: 'daily', desc: 'Commit pasado el mediodía (entre las 13:00 y las 14:00), con el almuerzo todavía en la mesa.', test: ({ facts }) => facts.commits.lastToday !== null && facts.commits.today >= 1 && (minutes(facts.commits.lastToday) ?? 0) >= 13 * 60 && (minutes(facts.commits.lastToday) ?? 0) < 14 * 60 },
  { id: 'noctambulo', name: 'Noctámbulo', emoji: '🦉', kind: 'daily', desc: 'Commit después de las 22:00. Dormir es para los que no tienen un bug pendiente.', test: ({ facts }) => lastAfter(facts, 22 * 60) },
  { id: 'sin-descanso', name: 'Sin descanso', emoji: '🏝️', kind: 'daily', desc: 'Commit en fin de semana. Descansá, che. (Igual, bien ahí.)', test: ({ facts }) => (facts.weekday === 0 || facts.weekday === 6) && facts.commits.today >= 1 },
  { id: 'semana-redonda', name: 'Semana redonda', emoji: '🔵', kind: 'daily', desc: 'Llegaste a 25 commits en la semana. Redondo, como un buen mate.', test: ({ facts }) => facts.commits.week >= 25 },

  // ---------------------------------------------------------------- de toda la vida: una sola vez
  { id: 'hola-agente', name: 'Hola, agente', emoji: '👋', kind: 'lifetime', desc: 'Lanzaste tu primer agente. Bienvenido al equipo de siliconas.', test: ({ state }) => total(state, 'agents') >= 1 },
  { id: 'equipo-armado', name: 'Equipo armado', emoji: '⚽', kind: 'lifetime', desc: '10 agentes lanzados en total. Ya hay para armar un partido.', test: ({ state }) => total(state, 'agents') >= 10 },
  { id: 'pequeno-ejercito', name: 'Pequeño ejército', emoji: '🪖', kind: 'lifetime', desc: '50 agentes lanzados. Se sienten los pasos.', test: ({ state }) => total(state, 'agents') >= 50 },
  { id: 'legion', name: 'Legión', emoji: '🏛️', kind: 'lifetime', desc: '100 agentes lanzados. Ave, César.', test: ({ state }) => total(state, 'agents') >= 100 },
  { id: 'skynet-moderado', name: 'Skynet (moderado)', emoji: '🛰️', kind: 'lifetime', desc: '500 agentes lanzados. Todavía no se rebelaron. Todavía.', test: ({ state }) => total(state, 'agents') >= 500 },
  { id: 'domador-de-agentes', name: 'Domador de agentes', emoji: '🪄', kind: 'lifetime', desc: 'Diez agentes corriendo a la vez. Con látigo y todo.', test: ({ facts }) => facts.agents.maxParallelToday >= 10 },
  { id: 'centenario', name: 'Centenario', emoji: '💯', kind: 'lifetime', desc: '100 commits desde que el panel te mira. Un número redondo.', test: ({ state }) => total(state, 'commits') >= 100 },
  { id: 'medio-millar', name: 'Medio millar', emoji: '🪙', kind: 'lifetime', desc: '500 commits. El historial ya da para una novela.', test: ({ state }) => total(state, 'commits') >= 500 },
  { id: 'mil-y-un-commits', name: 'Mil y un commits', emoji: '📚', kind: 'lifetime', desc: '1001 commits, como las noches. Scheherazade estaría orgullosa.', test: ({ state }) => total(state, 'commits') >= 1001 },
  { id: 'constancia-7', name: 'Constante', emoji: '🗓️', kind: 'lifetime', desc: '7 días trabajando con el panel abierto. Una semana de oficio.', test: ({ state }) => total(state, 'activeDays') >= 7 },
  { id: 'constancia-30', name: 'De la casa', emoji: '🏠', kind: 'lifetime', desc: '30 días de actividad. Ya tenés llave propia.', test: ({ state }) => total(state, 'activeDays') >= 30 },
  { id: 'constancia-100', name: 'Veterano', emoji: '🎖️', kind: 'lifetime', desc: '100 días de actividad. Ya viste cosas que no creerías.', test: ({ state }) => total(state, 'activeDays') >= 100 },
  { id: 'semana-perfecta', name: 'Semana perfecta', emoji: '🌟', kind: 'lifetime', desc: '5 días con el checklist completo. Un ejemplo para la humanidad.', test: ({ state }) => total(state, 'checklistDays') >= 5 },
  { id: 'mes-impecable', name: 'Mes impecable', emoji: '👑', kind: 'lifetime', desc: '20 días con el checklist completo. Sos un reloj suizo.', test: ({ state }) => total(state, 'checklistDays') >= 20 },
  { id: 'barril-sin-fondo', name: 'Barril sin fondo', emoji: '🛢️', kind: 'lifetime', desc: '5 millones de tokens en un solo día. ¿Todo bien en casa?', test: ({ facts }) => facts.agents.tokensToday >= 5_000_000 },
  { id: 'racha-de-fuego', name: 'Racha de fuego', emoji: '☄️', kind: 'lifetime', desc: '5 días seguidos con commits (los findes no cortan). Imparable.', test: ({ facts }) => facts.commits.today > 0 && commitStreak(facts.commits.byDay, facts.day) >= 5 },
  { id: 'maraton', name: 'Maratonista', emoji: '🏃', kind: 'lifetime', desc: '40 commits en una semana. Tomá agua.', test: ({ facts }) => facts.commits.week >= 40 },
  { id: 'primer-record', name: 'Rompe-marcas', emoji: '🏅', kind: 'lifetime', desc: 'Rompiste tu primer récord personal. A superarte.', test: ({ state }) => total(state, 'recordsBroken') >= 1 },
  { id: 'diez-records', name: 'Pulverizador', emoji: '💥', kind: 'lifetime', desc: 'Diez récords rotos. Los récords tiemblan cuando te ven.', test: ({ state }) => total(state, 'recordsBroken') >= 10 },
  { id: 'bautizo', name: 'Bautizo', emoji: '🍼', kind: 'lifetime', desc: 'Le pusiste nombre a tu mascota. Ya es de la familia.', test: ({ state }) => flag(state, 'mascotNamed') },
  { id: 'coleccionista', name: 'Coleccionista', emoji: '🎴', kind: 'lifetime', desc: 'Probaste tres mascotas distintas. Infiel, pero con estilo.', test: ({ state }) => Number(state.flags['mascotsTried'] ?? 0) >= 3 },
  { id: 'festejador', name: 'Festejador', emoji: '🎊', kind: 'lifetime', desc: '25 festejos. Cualquier excusa es buena para el confeti.', test: ({ state }) => state.counters.celebrations >= 25 },
  { id: 'cinco-logros', name: 'Principiante con suerte', emoji: '🥉', kind: 'lifetime', desc: '5 logros ganados. El principio de algo grande.', test: ({ state }) => Object.keys(state.unlocked).length >= 5 },
  { id: 'veinte-logros', name: 'Cazador de logros', emoji: '🥈', kind: 'lifetime', desc: '20 logros distintos. Esto ya es un hobby.', test: ({ state }) => Object.keys(state.unlocked).length >= 20 },
  { id: 'treinta-logros', name: 'Maestro de logros', emoji: '🥇', kind: 'lifetime', desc: '30 logros distintos. Se te va a acabar la vitrina.', test: ({ state }) => Object.keys(state.unlocked).length >= 30 },

  // ---------------------------------------------------------------- secretos
  { id: 'a-las-tres', name: '¿Vos dormís?', emoji: '🧛', kind: 'lifetime', secret: true, desc: 'Un commit entre las 3 y las 5 de la mañana. Hay gente que cuida su sueño; vos cuidás los deploys.', test: ({ facts }) => { const m = minutes(facts.commits.lastToday); return m !== null && m >= 3 * 60 && m < 5 * 60; } },
  { id: 'dia-del-pi', name: 'Día del Pi', emoji: '🥧', kind: 'lifetime', secret: true, desc: 'Commit el 14 de marzo. Irracional, pero con sentido.', test: ({ facts }) => facts.day.endsWith('-03-14') && facts.commits.today >= 1 },
  { id: 'navidad-de-codigo', name: 'Navidad de código', emoji: '🎄', kind: 'lifetime', secret: true, desc: 'Commit un 24 o 25 de diciembre. Papá Noel también hace deploys.', test: ({ facts }) => (facts.day.endsWith('-12-24') || facts.day.endsWith('-12-25')) && facts.commits.today >= 1 },
  { id: 'viernes-13', name: 'Viernes 13 sin miedo', emoji: '🔪', kind: 'lifetime', secret: true, desc: 'Un commit un viernes 13. Las supersticiones no compilan.', test: ({ facts }) => facts.weekday === 5 && facts.day.endsWith('-13') && facts.commits.today >= 1 },
  { id: 'cuatro-veinte', name: 'Hora pico', emoji: '⏰', kind: 'lifetime', secret: true, desc: 'Un commit a las 11:11. Pedí un deseo.', test: ({ facts }) => facts.commits.lastToday === '11:11' || facts.commits.firstToday === '11:11' },
  { id: 'todo-junto', name: 'Todo junto', emoji: '🧩', kind: 'lifetime', secret: true, desc: 'El día perfecto: 5 commits, 3 agentes en paralelo y el checklist completo.', test: ({ facts }) => facts.commits.today >= 5 && facts.agents.maxParallelToday >= 3 && allDone(facts) },
  // ---------------------------------------------------------------- los muy difíciles (épicos y legendarios)
  { id: 'racha-10', name: 'Imparable', emoji: '🚂', kind: 'lifetime', desc: '10 días hábiles seguidos con actividad. Los fines de semana y feriados no cortan la racha.', test: ({ state }) => state.counters.streak >= 10 },
  { id: 'racha-20', name: 'Máquina de rachas', emoji: '⚙️', kind: 'lifetime', desc: '20 días hábiles seguidos con actividad. Un mes entero sin aflojar.', test: ({ state }) => state.counters.streak >= 20 },
  { id: 'racha-60', name: 'Inmortal', emoji: '♾️', kind: 'lifetime', desc: '60 días hábiles seguidos con actividad. Tres meses sin faltar. Que alguien le avise a tus amigos que estás bien.', test: ({ state }) => state.counters.streak >= 60 },
  { id: 'semana-de-oro', name: 'Semana de oro', emoji: '🥇', kind: 'lifetime', desc: '5 días hábiles seguidos con el checklist completo. Ni un solo día flojo.', test: ({ state }) => state.counters.checklistStreak >= 5 },
  { id: 'mes-de-oro', name: 'Mes de oro', emoji: '🏆', kind: 'lifetime', desc: '20 días hábiles seguidos con el checklist completo. Hay gente que no logra ordenar la heladera.', test: ({ state }) => state.counters.checklistStreak >= 20 },
  { id: 'dia-legendario', name: 'Día legendario', emoji: '🐉', kind: 'lifetime', desc: 'En un solo día: 15 commits, 8 agentes en paralelo, tres tickets, los tres modelos y el checklist completo. Eso no es un día, es una epopeya.', test: ({ facts }) => facts.commits.today >= 15 && facts.agents.maxParallelToday >= 8 && facts.ticketsToday.length >= 3 && ['opus', 'sonnet', 'haiku'].every((model) => facts.agents.modelsToday.includes(model)) && allDone(facts) },
  { id: 'barrida', name: 'Barrida', emoji: '🧹', kind: 'lifetime', desc: 'Doce logros diarios ganados en el mismo día. Pasaste la escoba por la vitrina.', test: ({ earnedToday }) => earnedToday.length >= 12 },
  { id: 'semana-brutal', name: 'Semana brutal', emoji: '💪', kind: 'lifetime', desc: '60 commits en una semana. Tu teclado pide vacaciones.', test: ({ facts }) => facts.commits.week >= 60 },
  { id: 'reactor', name: 'Reactor', emoji: '☢️', kind: 'lifetime', desc: '20 millones de tokens en un solo día. Esto ya es fusión nuclear.', test: ({ facts }) => facts.agents.tokensToday >= 20_000_000 },
  { id: 'mil-agentes', name: 'Mil agentes', emoji: '🪐', kind: 'lifetime', desc: '1000 agentes lanzados en total. Ya sos un país.', test: ({ state }) => state.counters.agents >= 1000 },
  { id: 'cinco-mil-commits', name: 'Cinco mil commits', emoji: '🏔️', kind: 'lifetime', desc: '5000 commits. El historial de git te debe una estatua.', test: ({ state }) => state.counters.commits >= 5000 },
  { id: 'leyenda-viva', name: 'Leyenda viva', emoji: '🗿', kind: 'lifetime', desc: '365 días de actividad con el panel. Un año entero. Ya sos parte del mobiliario.', test: ({ state }) => state.counters.activeDays >= 365 },
  { id: 'oceano-de-tokens', name: 'Océano de tokens', emoji: '🌊', kind: 'lifetime', desc: '100 millones de tokens en total. Las ballenas te saludan.', test: ({ state }) => state.counters.tokens >= 100_000_000 },
  { id: 'aniversario', name: 'Aniversario', emoji: '🎂', kind: 'lifetime', desc: 'Un año desde tu primer día con el panel. ¡Feliz cumple, dev!', test: ({ state, facts }) => state.counters.firstDay !== '' && daysBetween(state.counters.firstDay, facts.day) >= 365 },
  { id: 'festejador-supremo', name: 'Festejador supremo', emoji: '🪩', kind: 'lifetime', desc: '500 festejos. Vivís de fiesta en fiesta.', test: ({ state }) => state.counters.celebrations >= 500 },
  { id: 'coleccionista-total', name: 'Coleccionista total', emoji: '🎠', kind: 'lifetime', desc: 'Probaste todas las mascotas. Las tenés a todas fichadas.', test: ({ state }) => Number(state.flags['mascotsTried'] ?? 0) >= MASCOTS.length },
  { id: 'gran-maestro', name: 'Gran maestro', emoji: '🎓', kind: 'lifetime', desc: '45 logros distintos. A esta altura ya das clases.', test: ({ state }) => Object.keys(state.unlocked).length >= 45 },
  { id: 'leyenda-de-logros', name: 'Leyenda de logros', emoji: '🌌', kind: 'lifetime', desc: '60 logros distintos. La vitrina ya no te entra en la casa.', test: ({ state }) => Object.keys(state.unlocked).length >= 60 },
  { id: 'completista', name: 'Completista', emoji: '👑', kind: 'lifetime', desc: 'Ganaste TODOS los logros a la vista (los secretos no cuentan). Podés retirarte. O seguir, como siempre.', test: ({ state }) => RAW.filter((achievement) => !achievement.secret && achievement.id !== 'completista').every((achievement) => state.unlocked[achievement.id] !== undefined) },
];

/** La dificultad de cada logro (los que no figuran son comunes). Los legendarios son de mucho tiempo o de un día casi perfecto. */
const TIERS: Record<string, Tier> = {
  // raros
  ametralladora: 'raro', 'jefe-de-planta': 'raro', 'rebano-digital': 'raro', 'tres-modelos': 'raro', 'quemador-de-tokens': 'raro', 'semana-redonda': 'raro', 'pequeno-ejercito': 'raro', centenario: 'raro', 'constancia-30': 'raro', 'semana-perfecta': 'raro', 'racha-de-fuego': 'raro', maraton: 'raro', coleccionista: 'raro', festejador: 'raro', 'veinte-logros': 'raro', 'todo-junto': 'raro', 'a-las-tres': 'raro', 'dia-del-pi': 'raro', 'navidad-de-codigo': 'raro', 'viernes-13': 'raro', 'cuatro-veinte': 'raro', 'racha-10': 'raro', 'semana-de-oro': 'raro',
  // épicos
  legion: 'epico', 'domador-de-agentes': 'epico', 'medio-millar': 'epico', 'constancia-100': 'epico', 'mes-impecable': 'epico', 'barril-sin-fondo': 'epico', 'diez-records': 'epico', 'treinta-logros': 'epico', 'skynet-moderado': 'epico', 'racha-20': 'epico', barrida: 'epico', reactor: 'epico', 'coleccionista-total': 'epico', aniversario: 'epico', 'festejador-supremo': 'epico', 'semana-brutal': 'epico', 'gran-maestro': 'epico',
  // legendarios
  'mil-y-un-commits': 'legendario', 'mil-agentes': 'legendario', 'cinco-mil-commits': 'legendario', 'leyenda-viva': 'legendario', 'oceano-de-tokens': 'legendario', completista: 'legendario', 'racha-60': 'legendario', 'mes-de-oro': 'legendario', 'dia-legendario': 'legendario', 'leyenda-de-logros': 'legendario',
};

export const ACHIEVEMENTS: Achievement[] = RAW.map((achievement) => ({ ...achievement, tier: TIERS[achievement.id] ?? 'comun' }));

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
