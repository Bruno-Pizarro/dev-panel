import { Bot, BellOff, Boxes, Clock, GitBranch, GitCommitHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { DEFAULT_BAR_PREFS, withDefaults, workdayText, type ActivityBarData, type ActivityBarPrefs } from '../lib/activityBar';
import { useDnd } from '../lib/dnd';
import { useStoredState } from '../lib/hooks';
import { formatTokens } from '../lib/orchestration';
import { DEFAULT_GAME_PREFS, gamePrefs, type Prefs } from '../lib/rewards/types';
import { DAY_WRAP_EVENT } from '../lib/rewards/dayWrap';
import { Mascot } from './Mascot';

/** Cada cuánto se piden los datos (el servidor además los guarda 30 s). */
const POLL_MS = 60_000;
/** Alto de la barra: 2 rem. Los avisos de abajo a la derecha se suben esto para no taparla. */
export const BAR_HEIGHT = '2rem';

const Item = ({ to, title, children, className }: { to: string; title: string; children: React.ReactNode; className?: string }) => (
  <Link to={to} title={title} className={cn('flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-2 hover:text-fg', className)}>{children}</Link>
);

/**
 * Barra fina al pie de todas las pantallas con lo que estás haciendo: en qué repo, rama y ticket, los commits de hoy, los agentes de Claude
 * y los tokens de hoy, cuánto llevás de jornada y cómo está el entorno. Solo datos locales. Cada segmento lleva a su pantalla; se apaga
 * entera o por segmento en Configuración → Avisos.
 */
export const ActivityBar = () => {
  const [stored] = useStoredState<Partial<ActivityBarPrefs>>('dev-panel.activitybar.prefs', DEFAULT_BAR_PREFS);
  const prefs = withDefaults(stored);
  const [data, setData] = useState<ActivityBarData | null>(null);
  const [now, setNow] = useState(() => new Date());
  const dnd = useDnd();
  const [storedGame] = useStoredState<Partial<Prefs>>('dev-panel.game.prefs', DEFAULT_GAME_PREFS);
  const game = gamePrefs(storedGame);

  useEffect(() => {
    if (!prefs.enabled) return;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api.get<ActivityBarData>('/api/activity-bar').then(setData, () => undefined);
    };
    load();
    const poll = window.setInterval(load, POLL_MS);
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [prefs.enabled]);

  const visible = prefs.enabled && data !== null;
  // Los avisos de la esquina se acomodan encima de la barra.
  useEffect(() => {
    document.documentElement.style.setProperty('--footer-h', visible ? BAR_HEIGHT : '0px');
    return () => document.documentElement.style.setProperty('--footer-h', '0px');
  }, [visible]);
  if (!visible || !data) return null;

  const { segments } = prefs;
  const workday = workdayText(now, data.workday);
  const context = data.context;
  // La mascota lee el ánimo del día: servicios caídos, cambios en una rama protegida, agentes trabajando y la jornada.
  const servicesDown = data.services !== null && data.services.running > 0 && data.services.running < data.services.total;
  const mascotInput = { trouble: servicesDown, agentsRunning: data.agents.running, workday: workday?.state ?? null, weekend: now.getDay() === 0 || now.getDay() === 6, commitsToday: data.commitsToday };
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 overflow-x-clip overflow-y-visible border-t border-line bg-surface/60 px-6 text-sm text-muted" aria-label="Actividad" data-testid="activity-bar">
      {game.enabled && game.mascot && <Mascot mascotId={game.mascotId} name={game.mascotName} input={mascotInput} />}
      {segments.context && (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {context ? (
            <Item to="/entorno" title={`${context.repo} en ${context.branch}${context.dirty ? `, ${context.dirty} archivos sin commitear` : ''}${context.ahead ? `, ${context.ahead} commits sin pushear` : ''}`} className="min-w-0">
              <GitBranch className="size-4 shrink-0" aria-hidden />
              <span className="truncate font-mono">{context.repo} · {context.branch}</span>
              {context.ticket && <span className="shrink-0 text-accent">#{context.ticket}</span>}
              {context.dirty > 0 && <span className="shrink-0 text-warning">● {context.dirty}</span>}
              {context.ahead > 0 && <span className="shrink-0 text-info">↑{context.ahead}</span>}
            </Item>
          ) : <span className="px-1.5">Sin repos a la vista</span>}
        </div>
      )}
      {!segments.context && <div className="flex-1" />}
      <div className="flex shrink-0 items-center gap-3">
        {segments.today && <Item to="/daily" title="Commits de hoy (tuyos, en los repos del panel)" className="hidden md:flex"><GitCommitHorizontal className="size-4" aria-hidden />{data.commitsToday} {data.commitsToday === 1 ? 'commit' : 'commits'} hoy</Item>}
        {segments.agents && (
          <Item to="/agentes" title={`Agentes de Claude: ${data.agents.running} trabajando, ${data.agents.today} lanzados hoy. Tokens de hoy: ${data.agents.tokensToday.toLocaleString('es-AR')} (entrada + salida + caché creada, la conversación y sus agentes)`} className="hidden sm:flex">
            <Bot className="size-4" aria-hidden />
            {data.agents.running > 0 ? <span className="flex items-center gap-1.5 text-accent"><span className="size-2 animate-pulse-dot rounded-full bg-accent" aria-hidden />{data.agents.running} trabajando</span> : <span>{data.agents.today} {data.agents.today === 1 ? 'agente' : 'agentes'} hoy</span>}
            <span>· {formatTokens(data.agents.tokensToday)} tokens</span>
          </Item>
        )}
        {segments.workday && workday && (
          <button type="button" onClick={() => window.dispatchEvent(new Event(DAY_WRAP_EVENT))} title="Tu jornada según el horario configurado. Clic: tu día en 10 segundos" className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-2 hover:text-fg lg:flex">
            <Clock className="size-4" aria-hidden /><span className={cn(workday.state === 'after' && 'text-warning')}>{workday.text}</span>
          </button>
        )}
        {segments.services && data.services && (
          <Item to="/servicios" title="Servicios obligatorios corriendo" className="hidden md:flex">
            <Boxes className="size-4" aria-hidden />
            <span className={cn(data.services.running < data.services.total && 'text-warning')}>{data.services.running}/{data.services.total} servicios</span>
          </Item>
        )}
        {dnd.active && <span className="flex shrink-0 items-center gap-1.5 px-1.5" title="No molestar: sin avisos de la esquina"><BellOff className="size-4" aria-hidden />{dnd.label}</span>}
      </div>
    </footer>
  );
};
