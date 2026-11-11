import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { SpriteFace } from './SpriteFace';
import { CELEBRATE_EVENT } from '../lib/rewards/bus';
import { faceOf, mascotById, moodOf, MOOD_BADGE, type Mood, type MoodInput } from '../lib/rewards/mascots';
import { pickTalk, type TalkWeather } from '../lib/rewards/mascotTalk';
import { currentTalkWeather, refreshTalkWeather } from '../lib/rewards/talkWeather';

/** Cuánto dura la cara de fiesta después de un festejo, cuánto queda un aviso suyo (agentes) y cuánto tarda en desvanecerse el globo (igual que `.mascot-bubble` en index.css). */
const PARTY_MS = 4500;
const BUBBLE_MS = 4000;
const FADE_MS = 1800;

/** Lo que dice cuando aparece un agente trabajando y cuando terminan todos. */
const AGENT_START_LINES = ['¡Llegó un agente! A trabajar.', 'Hay un agente en marcha, me pongo las pilas.', 'Agente en camino: yo superviso.'];
const AGENT_DONE_LINES = ['Los agentes terminaron. ¡Buen laburo!', 'Todo en silencio: ya terminaron los agentes.', 'Listo, los agentes cerraron su tarea.'];
const pick = (lines: string[]): string => lines[Math.floor(Math.random() * lines.length)]!;

/**
 * La mascota del pie: un bichito que reacciona a lo que pasa (duerme, trabaja cuando hay agentes, se preocupa si cae un servicio, festeja con
 * vos y se cansa al terminar la jornada). Al **pasarle el mouse** dice algo —de su ánimo, de la hora, del día o del clima si lo activaste en el
 * Inicio— y al sacarlo el globo se desvanece despacio. Se elige y se nombra en Configuración → Diversión.
 */
export const Mascot = ({ mascotId, name, input }: { mascotId: string; name: string; input: Omit<MoodInput, 'celebrating'> }) => {
  const mascot = mascotById(mascotId);
  const [party, setParty] = useState(false);
  // El globo: `bubble` es el texto (null = no hay) y `shown` si está a la vista; al sacar el mouse `shown` pasa a false y el texto se quita al terminar el desvanecido.
  const [bubble, setBubble] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [hovers, setHovers] = useState(0);
  const [weather, setWeather] = useState<TalkWeather | null>(() => currentTalkWeather());
  const fadeTimer = useRef(0);
  const hideTimer = useRef(0);
  const lastLine = useRef<string | null>(null);
  const hovering = useRef(false);

  useEffect(() => {
    let timer = 0;
    const onCelebrate = () => {
      setParty(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setParty(false), PARTY_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
      window.clearTimeout(timer);
    };
  }, []);
  // El clima (solo si el usuario lo activó en el Inicio): se pide al abrir y cada media hora; el servidor lo guarda 30 minutos.
  useEffect(() => {
    let active = true;
    const load = () => void refreshTalkWeather().then((value) => active && setWeather(value));
    load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => () => (window.clearTimeout(fadeTimer.current), window.clearTimeout(hideTimer.current)), []);

  const fadeOut = () => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(fadeTimer.current);
    setShown(false);
    fadeTimer.current = window.setTimeout(() => setBubble(null), FADE_MS);
  };
  const say = (text: string, autoHide = false) => {
    window.clearTimeout(fadeTimer.current);
    window.clearTimeout(hideTimer.current);
    lastLine.current = text;
    setBubble(text);
    setShown(true);
    if (autoHide) hideTimer.current = window.setTimeout(() => !hovering.current && fadeOut(), BUBBLE_MS);
  };

  // Detecta solo cuándo empieza y termina el trabajo de los agentes: se pone a trabajar, avisa y, al terminar, festeja un poquito.
  const previousAgents = useRef<number | null>(null);
  useEffect(() => {
    const before = previousAgents.current;
    previousAgents.current = input.agentsRunning;
    if (before === null) return;
    if (before === 0 && input.agentsRunning > 0) say(pick(AGENT_START_LINES), true);
    else if (before > 0 && input.agentsRunning === 0) {
      say(pick(AGENT_DONE_LINES), true);
      setParty(true);
      const timer = window.setTimeout(() => setParty(false), 2500);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.agentsRunning]);

  const mood: Mood = moodOf({ ...input, celebrating: party });
  const label = name.trim() || mascot.name;
  const onEnter = () => {
    hovering.current = true;
    setHovers((count) => count + 1);
    // Si el globo todavía se estaba desvaneciendo, vuelve a verse con la misma frase.
    if (bubble !== null && !shown) {
      window.clearTimeout(fadeTimer.current);
      setShown(true);
      return;
    }
    if (bubble !== null) return;
    say(pickTalk({ mood, now: new Date(), weather }, Math.random, lastLine.current));
  };
  const onLeave = () => {
    hovering.current = false;
    if (bubble !== null) fadeOut();
  };
  return (
    <span className="relative flex shrink-0 items-center">
      {bubble && (
        <span
          className={cn('mascot-bubble pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-max max-w-64 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg shadow-pop', shown ? 'opacity-100' : 'opacity-0')}
          role="status"
          data-testid="mascot-bubble"
        >
          <span className="mb-0.5 block text-sm font-semibold uppercase leading-4 tracking-wider text-accent/70" data-testid="mascot-bubble-name">{label}</span>
          {bubble}
        </span>
      )}
      <button type="button" onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={onLeave} title={`${label} — pasale el mouse`} aria-label={`${label}, tu mascota`} data-testid="mascot" data-mood={mood} className="relative flex h-8 min-w-7 items-center justify-center rounded-md px-1 text-lg leading-none transition-transform hover:scale-110">
        {mascot.sprite ? (
          <span className={cn('inline-block', mood === 'party' && 'mascot-party', mood === 'worried' && !mascot.sprite.worried && 'mascot-worried', mood === 'tired' && 'mascot-tired', mood === 'sleep' && 'mascot-sleep', mood === 'happy' && 'mascot-happy')}><SpriteFace sprite={mascot.sprite} mood={mood} height={28} /></span>
        ) : (
          <span className={cn('inline-block', `mascot-${mood}`)} aria-hidden>{faceOf(mascot, mood)}</span>
        )}
        {MOOD_BADGE[mood] && <span key={`${mood}-${hovers}`} className="absolute -right-1 -top-1.5 text-sm leading-none" aria-hidden>{MOOD_BADGE[mood]}</span>}
      </button>
    </span>
  );
};
