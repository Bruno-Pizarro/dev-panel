import { Award, Sparkles, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useDnd } from '../lib/dnd';
import { useStoredState } from '../lib/hooks';
import { ACHIEVEMENT_BY_ID } from '../lib/rewards/achievements';
import { CELEBRATE_EVENT, CELEBRATION_TEXT, type CelebrateDetail } from '../lib/rewards/bus';
import { confetti, playSound, soundFor } from '../lib/rewards/effects';
import { celebrated, rollPraise, step } from '../lib/rewards/engine';
import { RECORDS } from '../lib/rewards/records';
import { DEFAULT_GAME_PREFS, EMPTY_GAME, gamePrefs, type CelebrationLevel, type GameState, type Prefs, type RewardEvent, type RewardFacts } from '../lib/rewards/types';

/** Cada cuánto se piden los hechos del día. La primera vez, un rato después de abrir el panel (no encima del saludo). */
const POLL_MS = 60_000;
const FIRST_MS = 15_000;
/** Cuánto queda a la vista una tarjeta, y cuántas esperan como mucho. */
const SHOW_MS = 7000;
const MAX_QUEUE = 5;
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
  const [stored] = useStoredState<Partial<Prefs>>('dev-panel.game.prefs', DEFAULT_GAME_PREFS);
  const prefs = gamePrefs(stored);
  const [game, setGame] = useStoredState<GameState>('dev-panel.game.state', EMPTY_GAME);
  const [queue, setQueue] = useState<Card[]>([]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [paused, setPaused] = useState(false);
  const dnd = useDnd();
  const latest = useRef({ prefs, game, dnd: dnd.active, lastPraise: '' });
  latest.current = { prefs, game, dnd: dnd.active, lastPraise: latest.current.lastPraise };

  const show = useCallback((level: CelebrationLevel | null, cards: Card[]) => {
    const { prefs: p, dnd: quiet } = latest.current;
    if (quiet || !p.enabled) return;
    if (level && p.celebrations) confetti(level);
    if (level && p.sound) playSound(soundFor(level));
    if (cards.length) setQueue((current) => [...current, ...cards].filter((card, index, all) => all.findIndex((other) => cardKey(other) === cardKey(card)) === index).slice(-MAX_QUEUE));
  }, []);

  // Los hechos del día → qué se desbloquea.
  useEffect(() => {
    if (!prefs.enabled) return;
    const evaluate = () => {
      if (document.visibilityState === 'hidden') return;
      api.get<RewardFacts>('/api/rewards/facts').then(
        (facts) => {
          const { game: state, prefs: p } = latest.current;
          const result = step({ state, facts, now: new Date(), prefs: p, rng: Math.random });
          setGame(result.state);
          latest.current.game = result.state;
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
  }, [prefs.enabled, setGame, show]);

  // Festejos que piden las pantallas (se completó algo) y la vista previa de Configuración.
  useEffect(() => {
    const onCelebrate = (event: Event) => {
      const { reason, level } = (event as CustomEvent<CelebrateDetail>).detail;
      const text = CELEBRATION_TEXT[reason];
      const { game: state } = latest.current;
      const roll = rollPraise(celebrated(state), new Date(), Math.random, latest.current.lastPraise);
      if (roll.text) latest.current.lastPraise = roll.text;
      setGame(roll.state);
      latest.current.game = roll.state;
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
  }, [setGame, show]);

  // De a una tarjeta por vez.
  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]!);
    setQueue((rest) => rest.slice(1));
  }, [current, queue]);
  useEffect(() => {
    if (!current || paused) return;
    const timer = window.setTimeout(() => setCurrent(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused]);

  if (!current) return null;
  const achievement = current.kind === 'achievement' ? ACHIEVEMENT_BY_ID[current.id] : undefined;
  const unlockedCount = current.kind === 'achievement' ? game.unlocked[current.id]?.count ?? 1 : 1;
  return (
    <section
      className="fixed bottom-[calc(1.5rem+var(--footer-h,0px))] left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 animate-fade-in rounded-2xl border border-accent/40 bg-surface shadow-pop"
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
              <p className="flex items-center gap-1.5 text-sm font-medium text-accent"><Trophy className="size-4" aria-hidden />Logro desbloqueado{current.first ? ' · ¡primera vez!' : unlockedCount > 1 ? ` · ×${unlockedCount}` : ''}</p>
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
        <button type="button" onClick={() => setCurrent(null)} aria-label="Cerrar" title="Cerrar" className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden /></button>
      </div>
    </section>
  );
};
