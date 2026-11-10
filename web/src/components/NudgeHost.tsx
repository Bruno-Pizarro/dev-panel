import { Bell, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useDnd } from '../lib/dnd';
import { funnyPool } from '../lib/greetings';
import { useStoredState } from '../lib/hooks';
import { afterShown, AUTO_CLOSE_MS, DEFAULT_PREFS, EMPTY_STATE, pickNext, snoozeNudge, stateForToday, type Nudge, type NudgePrefs, type NudgeState, type Pick } from '../lib/nudges';

/** Cada cuánto se piden los candidatos al servidor, y cada cuánto se decide si toca mostrar uno. */
const FETCH_MS = 5 * 60_000;
const TICK_MS = 60_000;
/** La primera consulta, un rato después de abrir el panel (no encima del saludo). */
const FIRST_FETCH_MS = 20_000;
export const NUDGE_DEMO_EVENT = 'dev-panel:nudge-demo';

const DEMO: Nudge = { id: 'demo', kind: 'git-dirty', title: 'Así se ve un aviso', detail: 'Aparecen de vez en cuando, abajo a la derecha, y se cierran solos a los 15 segundos.', priority: 0, link: null };

/** ¿El foco está en un campo donde se escribe? Entonces el aviso espera. */
const isTyping = (): boolean => {
  const element = document.activeElement as HTMLElement | null;
  return !!element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable);
};

/**
 * Avisos espontáneos: una tarjeta discreta abajo a la derecha, de vez en cuando, con algo que conviene no olvidar (lo calcula el
 * servidor, ver `services/nudges.ts`) o, más raro, una frase graciosa. Se cierra sola a los 15 segundos (se frena con el mouse
 * encima) y se puede cerrar, posponer una hora o silenciar ese tipo. Respeta «No molestar», la pantalla completa y cuando escribís.
 * Todo se apaga en Configuración → Avisos.
 */
export const NudgeHost = ({ userName }: { userName: string }) => {
  const [stored, setPrefs] = useStoredState<NudgePrefs>('dev-panel.nudges.prefs', DEFAULT_PREFS);
  // Las preferencias guardadas antes de que existiera un campo se completan con las de por defecto.
  const prefs: NudgePrefs = { ...DEFAULT_PREFS, ...stored };
  const [state, setState] = useStoredState<NudgeState>('dev-panel.nudges.state', EMPTY_STATE);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [current, setCurrent] = useState<Pick | null>(null);
  const [demo, setDemo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lift, setLift] = useState(0);
  const dnd = useDnd();
  const [params] = useSearchParams();
  const fullscreen = params.get('full') === '1';

  // Lo último, para que los temporizadores no usen valores viejos.
  const latest = useRef({ prefs, state, nudges, current, blocked: false, userName });
  latest.current = { prefs, state, nudges, current, blocked: dnd.active || fullscreen, userName };

  const evaluate = useCallback(() => {
    const now = Date.now();
    const { prefs: p, state: s, nudges: list, current: shown, blocked, userName: name } = latest.current;
    if (shown || !p.enabled || isTyping()) return;
    const pick = pickNext({ now, prefs: p, state: s, nudges: list, funnyPhrases: funnyPool(new Date(now), name), blocked, rng: Math.random });
    if (!pick) return;
    setState(afterShown(s, pick, now));
    setCurrent(pick);
  }, [setState]);

  useEffect(() => {
    if (!prefs.enabled) return;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api.get<{ nudges: Nudge[] }>('/api/nudges').then(
        (result) => {
          latest.current.nudges = result.nudges;
          setNudges(result.nudges);
          evaluate();
        },
        () => undefined,
      );
    };
    const first = window.setTimeout(load, FIRST_FETCH_MS);
    const fetchTimer = window.setInterval(load, FETCH_MS);
    const tick = window.setInterval(evaluate, TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(fetchTimer);
      window.clearInterval(tick);
    };
  }, [prefs.enabled, evaluate]);

  // Vista previa pedida desde Configuración → Avisos: no cuenta para los límites.
  useEffect(() => {
    const show = () => {
      setDemo(true);
      setCurrent({ type: 'useful', nudge: DEMO });
    };
    window.addEventListener(NUDGE_DEMO_EVENT, show);
    return () => window.removeEventListener(NUDGE_DEMO_EVENT, show);
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    setDemo(false);
    setPaused(false);
  }, []);

  // Se cierra sola a los 15 s; con el mouse encima se frena y, al salir, sigue con lo que le quedaba.
  const remaining = useRef(AUTO_CLOSE_MS);
  useEffect(() => {
    if (current) remaining.current = AUTO_CLOSE_MS;
  }, [current]);
  useEffect(() => {
    if (!current || paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(close, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt));
    };
  }, [current, paused, close]);

  // Si la tarjeta de agentes está a la vista, este aviso se acomoda arriba de ella.
  useEffect(() => {
    if (!current) return;
    const measure = () => {
      const agent = document.querySelector('[data-agent-ui]');
      setLift(agent ? agent.getBoundingClientRect().height + 12 : 0);
    };
    measure();
    const timer = window.setInterval(measure, 1000);
    return () => window.clearInterval(timer);
  }, [current]);

  if (!current) return null;
  const useful = current.type === 'useful' ? current.nudge : null;
  return (
    <section
      className="fixed right-4 z-40 w-72 max-w-[calc(100vw-2rem)] animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      style={{ bottom: `calc(${16 + lift}px + var(--footer-h, 0px))` }}
      aria-label="Aviso"
      role="status"
      data-testid="nudge-toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        {useful ? <Bell className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <Sparkles className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
        <div className="min-w-0 flex-1 space-y-1">
          {useful ? (
            <>
              <p className="text-sm font-semibold leading-snug">{useful.title}</p>
              <p className="text-sm leading-snug text-muted">{useful.detail}</p>
            </>
          ) : (
            <p className="text-sm leading-snug">{current.type === 'funny' ? current.text : ''}</p>
          )}
          {useful && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm">
              {useful.link && <Link to={useful.link} onClick={close} className="text-accent hover:underline">Ir</Link>}
              {!demo && (
                <>
                  <button type="button" onClick={() => (setState(snoozeNudge(stateForToday(state, Date.now()), useful.id, Date.now())), close())} className="text-muted hover:text-fg hover:underline">Posponer 1 h</button>
                  <button type="button" onClick={() => (setPrefs({ ...prefs, muted: [...new Set([...prefs.muted, useful.kind])] }), close())} className="text-muted hover:text-fg hover:underline" title="Se puede volver a activar en Configuración → Avisos">No avisar más de esto</button>
                </>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Cerrar el aviso" title="Cerrar" className="-mr-1 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden /></button>
      </div>
      <div className="h-0.5 bg-surface-3" aria-hidden>
        <div key={current.type === 'useful' ? current.nudge.id : current.text} className="animate-nudge-shrink h-full bg-accent/60" style={{ animationDuration: `${AUTO_CLOSE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
      </div>
    </section>
  );
};
