import { Award, Sparkles, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useDnd } from '../lib/dnd';
import { ACHIEVEMENT_BY_ID, TIER_LABEL } from '../lib/rewards/achievements';
import { CELEBRATE_EVENT, CELEBRATION_TEXT, type CelebrateDetail } from '../lib/rewards/bus';
import { confetti, playSound, soundFor } from '../lib/rewards/effects';
import { DAY_WRAP_EVENT, shouldWrap, wrapFlag } from '../lib/rewards/dayWrap';
import { celebrated, rollPraise, step } from '../lib/rewards/engine';
import { RECORDS } from '../lib/rewards/records';
import { gameStore, useGame } from '../lib/rewards/gameStore';
import type { CelebrationLevel, RewardEvent, RewardFacts } from '../lib/rewards/types';

/** Cada cuánto se piden los hechos del día. La primera vez, un rato después de abrir el panel (no encima del saludo). */
const POLL_MS = 60_000;
const FIRST_MS = 15_000;
/** Cuánto queda a la vista una tarjeta, y cuántas esperan como mucho. */
const SHOW_MS = 7000;
const MAX_QUEUE = 5;
/** Lo que dura el desvanecido al irse (debe coincidir con `reward-leave` en index.css). */
const LEAVE_MS = 260;
export const REWARD_DEMO_EVENT = 'dev-panel:reward-demo';

type Card =
  | { kind: 'achievement'; id: string; first: boolean }
  | { kind: 'record'; label: string; emoji: string; value: string; previous: string }
  | { kind: 'praise'; text: string }
  | { kind: 'message'; title: string; text: string };

const cardKey = (card: Card): string => (card.kind === 'achievement' ? `a:${card.id}` : card.kind === 'record' ? `r:${card.label}:${card.value}` : card.kind === 'praise' ? `p:${card.text}` : `m:${card.title}`);

const toCards = (events: RewardEvent[]): Card[] => {
  const cards: Card[] = [];
  for (const event of events) {
    if (event.type === 'achievement') cards.push({ kind: 'achievement', id: event.id, first: event.first });
    else if (event.type === 'record') {
      const def = RECORDS.find((item) => item.key === event.key);
      if (def) cards.push({ kind: 'record', label: def.label, emoji: def.emoji, value: def.format(event.value), previous: def.format(event.previous) });
    } else if (event.type === 'praise') cards.push({ kind: 'praise', text: event.text });
  }
  // Si se ganaron muchos de golpe (la primera vez), se muestran unos pocos y el resto se resume.
  const achievements = cards.filter((card) => card.kind === 'achievement');
  if (achievements.length > 3) {
    const keep = [...cards.filter((card) => card.kind !== 'achievement'), ...achievements.slice(0, 2)];
    return [...keep, { kind: 'message', title: `y ${achievements.length - 2} logros más`, text: 'Mirá la vitrina de logros.' }];
  }
  return cards;
};

const highest = (events: RewardEvent[]): CelebrationLevel | null => {
  const levels = events.flatMap((event) => (event.type === 'celebrate' ? [event.level] : []));
  return levels.includes('big') ? 'big' : levels.includes('medium') ? 'medium' : levels.includes('small') ? 'small' : null;
};

/**
 * Lo divertido del panel: festejos (confeti y sonido) cuando completás algo, logros con humor, récords personales y elogios sorpresa. Mira los
 * hechos del día cada minuto y escucha los festejos que piden las pantallas. Respeta «No molestar» y se apaga entero en Configuración → Diversión.
 * Todo es local: lo que desbloqueaste vive en este navegador.
 */
export const RewardHost = () => {
  // Logros y preferencias viven en el servidor (se ven igual desde cualquier navegador): acá hay una copia que se guarda sola.
  const { prefs, state: game, loaded } = useGame();
  const [queue, setQueue] = useState<Card[]>([]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [paused, setPaused] = useState(false);
  // La tarjeta sube suave desde abajo al aparecer y se desvanece al irse.
  const [leaving, setLeaving] = useState(false);
  const dnd = useDnd();
  const latest = useRef({ prefs, dnd: dnd.active, lastPraise: '' });
  latest.current = { prefs, dnd: dnd.active, lastPraise: latest.current.lastPraise };

  const show = useCallback((level: CelebrationLevel | null, cards: Card[]) => {
    const { prefs: p, dnd: quiet } = latest.current;
    if (quiet || !p.enabled) return;
    if (level && p.celebrations) confetti(level);
    if (level && p.sound) playSound(soundFor(level));
    if (cards.length) setQueue((current) => [...current, ...cards].filter((card, index, all) => all.findIndex((other) => cardKey(other) === cardKey(card)) === index).slice(-MAX_QUEUE));
  }, []);

  // Los hechos del día → qué se desbloquea.
  useEffect(() => {
    if (!prefs.enabled || !loaded) return;
    const evaluate = () => {
      if (document.visibilityState === 'hidden') return;
      // Primero lo vigente del servidor (otro navegador pudo haber ganado algo), después los hechos de hoy.
      Promise.all([api.get<RewardFacts>('/api/rewards/facts'), gameStore.refresh()]).then(
        ([facts]) => {
          const { state } = gameStore.getSnapshot();
          const { prefs: p } = latest.current;
          const result = step({ state, facts, now: new Date(), prefs: p, rng: Math.random });
          let next = result.state;
          // Pasada la hora de salida, el cierre del día se muestra solo (una vez por día).
          if (shouldWrap(facts, next, p, new Date(), latest.current.dnd)) {
            next = { ...next, flags: { ...next.flags, [wrapFlag(facts.day)]: true } };
            window.dispatchEvent(new Event(DAY_WRAP_EVENT));
          }
          gameStore.updateState(next);
          show(highest(result.events), toCards(result.events));
        },
        () => undefined,
      );
    };
    const first = window.setTimeout(evaluate, FIRST_MS);
    const poll = window.setInterval(evaluate, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [prefs.enabled, loaded, show]);

  // Festejos que piden las pantallas (se completó algo) y la vista previa de Configuración.
  useEffect(() => {
    const onCelebrate = (event: Event) => {
      const { reason, level } = (event as CustomEvent<CelebrateDetail>).detail;
      const text = CELEBRATION_TEXT[reason];
      const roll = rollPraise(celebrated(gameStore.getSnapshot().state), new Date(), Math.random, latest.current.lastPraise);
      if (roll.text) latest.current.lastPraise = roll.text;
      gameStore.updateState(roll.state);
      show(level, [...(text ? [{ kind: 'message', title: text.title, text: text.text } as Card] : []), ...(roll.text ? [{ kind: 'praise', text: roll.text } as Card] : [])]);
    };
    const onDemo = () => {
      const sample = ACHIEVEMENT_BY_ID['director-de-orquesta'];
      show('big', [{ kind: 'achievement', id: sample ? sample.id : 'rompehielo', first: false }]);
    };
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    window.addEventListener(REWARD_DEMO_EVENT, onDemo);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
      window.removeEventListener(REWARD_DEMO_EVENT, onDemo);
    };
  }, [show]);

  // De a una tarjeta por vez.
  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]!);
    setQueue((rest) => rest.slice(1));
  }, [current, queue]);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => {
      setCurrent(null);
      setLeaving(false);
      setPaused(false);
    }, LEAVE_MS);
  }, []);
  useEffect(() => {
    if (!current || paused || leaving) return;
    const timer = window.setTimeout(close, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, leaving, close]);

  if (!current) return null;
  const achievement = current.kind === 'achievement' ? ACHIEVEMENT_BY_ID[current.id] : undefined;
  const unlockedCount = current.kind === 'achievement' ? game.unlocked[current.id]?.count ?? 1 : 1;
  return (
    <div className="pointer-events-none fixed bottom-[calc(1.5rem+var(--footer-h,0px))] left-0 right-0 z-50 flex justify-center px-4">
    <section
      className={`pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border bg-surface shadow-pop ${leaving ? 'reward-leave' : 'reward-rise'} ${achievement?.tier === 'legendario' ? 'border-warning ring-2 ring-warning/40' : achievement?.tier === 'epico' ? 'border-accent ring-2 ring-accent/30' : 'border-accent/40'}`}
      role="status"
      aria-label="Festejo"
      data-testid="reward-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="text-3xl leading-none" aria-hidden>{current.kind === 'achievement' ? achievement?.emoji ?? '🏆' : current.kind === 'record' ? current.emoji : current.kind === 'praise' ? '✨' : '🎉'}</span>
        <div className="min-w-0 flex-1 space-y-0.5">
          {current.kind === 'achievement' && achievement && (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-accent"><Trophy className="size-4" aria-hidden />Logro {achievement.tier === 'comun' ? '' : `${TIER_LABEL[achievement.tier]} `}desbloqueado{current.first ? ' · ¡primera vez!' : unlockedCount > 1 ? ` · ×${unlockedCount}` : ''}</p>
              <p className="text-base font-semibold leading-snug">{achievement.name}</p>
              <p className="text-sm leading-snug text-muted">{achievement.desc}</p>
            </>
          )}
          {current.kind === 'record' && (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning"><Award className="size-4" aria-hidden />¡Nuevo récord personal!</p>
              <p className="text-base font-semibold leading-snug">{current.label}</p>
              <p className="text-sm text-muted">Ahora: <span className="font-mono font-semibold text-fg">{current.value}</span> (antes {current.previous})</p>
            </>
          )}
          {current.kind === 'praise' && <p className="flex items-center gap-1.5 text-base leading-snug"><Sparkles className="size-4 shrink-0 text-warning" aria-hidden />{current.text}</p>}
          {current.kind === 'message' && (
            <>
              <p className="text-base font-semibold leading-snug">{current.title}</p>
              <p className="text-sm leading-snug text-muted">{current.text}</p>
            </>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Cerrar" title="Cerrar" className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden /></button>
      </div>
    </section>
    </div>
  );
};
