import { CircleAlert, CircleCheck, FolderTree, Moon, NotebookText, Rocket, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CheckList } from '../components/CheckList';
import { DailyChecklistCard } from '../components/DailyChecklistCard';
import { HomeNotices } from '../components/HomeNotices';
import { WeatherBadge } from '../components/WeatherBadge';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { StatusDot } from '../components/StatusDot';
import { api } from '../lib/api';
import type { Check, DailyChecklist, DevPanelConfig, SetupDetect } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { uniqueById } from '../lib/uniqueById';
import { contextFromNotices, pickGreeting, slotOf, workdayPhase, type GreetingContext, type Slot } from '../lib/greetings';
import { DAY_WRAP_EVENT } from '../lib/rewards/dayWrap';
import { useHomeNotices, type HomeNoticesState } from '../lib/useHomeNotices';

const SLOT_ICONS: Record<Slot, LucideIcon> = { madrugada: Moon, amanecer: Sunrise, manana: Sunrise, mediodia: Sun, tarde: Sunset, noche: Moon };
const LAST_GREETING_KEY = 'dev-panel.greeting.last';

/** Saludo simpático según la hora; una vez por visita, distinto del anterior. Las frases con nombre solo salen si hay nombre configurado. */
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const Greeting = ({ name, notices, workday }: { name: string; notices: HomeNoticesState; workday: { entry: string; exit: string } }) => {
  const checklist = useAsync(() => api.get<DailyChecklist>('/api/checklist/daily'));
  // El saludo se elige UNA sola vez, cuando ya se sabe todo lo que puede mencionar (avisos y checklist), y no se vuelve a calcular
  // en esta visita: ni al ocultar un aviso, ni al tildar el checklist, ni con el paso del tiempo. Si algo tarda más de 3 s, se elige igual.
  const [text, setText] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const picked = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  const ready = ((notices.report !== null || notices.failed !== null) && (checklist.data !== null || checklist.error !== null)) || waited;
  useEffect(() => {
    if (!ready || picked.current) return;
    picked.current = true;
    const now = new Date();
    const items = checklist.data?.items ?? [];
    const phase = workdayPhase(now, workday, { entry: items.some((item) => item.id === 'marcar-entrada' && item.done), hours: items.some((item) => item.id === 'cargar-horas' && item.done) });
    // Los avisos que ocultaste por hoy no cuentan para el saludo.
    const all = notices.report ? uniqueById([...notices.report.reminders, ...notices.report.routines, ...(notices.report.discord ?? []), ...notices.report.notices]) : [];
    const context: GreetingContext = { ...contextFromNotices(all.filter((notice) => !notices.hidden.includes(notice.id)), todayIso()), workday: phase, offDays: notices.report?.offDays ?? [] };
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_GREETING_KEY);
    } catch {
      /* sin almacenamiento */
    }
    const chosen = pickGreeting(now, name, Math.random, last, context);
    try {
      window.localStorage.setItem(LAST_GREETING_KEY, chosen);
    } catch {
      /* sin almacenamiento */
    }
    setText(chosen);
  }, [ready, name, workday, notices.report, notices.hidden, checklist.data]);
  const Icon = SLOT_ICONS[slotOf(new Date().getHours())];
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line bg-gradient-to-r from-accent/10 to-transparent px-5 py-4">
      <p className="flex min-h-[2rem] min-w-0 flex-1 items-center gap-3 text-lg font-medium" data-testid="greeting">
        <Icon className="size-6 shrink-0 text-accent" aria-hidden />
        <span>{text ?? <Skeleton className="h-6 w-80 max-w-full" />}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<NotebookText className="size-4" />} onClick={() => window.dispatchEvent(new Event(DAY_WRAP_EVENT))} title="Commits, agentes, tokens, checklist y logros de hoy">Ver mi día</Button>
        <WeatherBadge />
      </div>
    </div>
  );
};

export const Home = ({ config }: { config: DevPanelConfig }) => {
  const notices = useHomeNotices();
  const detect = useAsync(() => api.get<SetupDetect>('/api/setup/detect'));
  const data = detect.data;
  const checks = useAsync(() => api.get<{ checks: Check[] }>('/api/checks'));

  return (
    <>
      <PageHeader title="Inicio" description="Estado del entorno de desarrollo." />
      <Greeting name={config.userName} notices={notices} workday={config.workday} />
      <HomeNotices state={notices} />
      <DailyChecklistCard />
      {detect.loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Docker">
              <StatusDot status={data.docker.ok ? 'ok' : 'error'} label={data.docker.ok ? `Motor ${data.docker.version}` : 'No responde'} />
              <p className="mt-2 text-sm text-muted">Compose {data.compose.ok ? data.compose.version : 'no disponible'}</p>
            </Card>
            <Card title="Contenedores">
              <div className="text-3xl font-semibold">{data.containers.length}</div>
              <p className="mt-1 text-sm text-muted">existentes en esta máquina</p>
            </Card>
            <Card title="Configuración">
              <StatusDot status={data.missingServices.length === 0 ? 'ok' : 'warn'} label={data.missingServices.length === 0 ? 'Servicios coherentes con el compose' : `Sin encontrar en el compose: ${data.missingServices.join(', ')}`} />
              <p className="mt-2 break-words text-sm text-muted">Base de conocimiento: <span className="break-all font-mono">{config.paths.extra}</span></p>
            </Card>
          </div>

          <Card title="Chequeos de entorno" action={<button type="button" onClick={checks.reload} className="text-sm text-accent hover:underline">Volver a revisar</button>}>
            {checks.loading ? <Skeleton className="h-40" /> : checks.data ? <CheckList checks={checks.data.checks} /> : <p className="text-danger">{checks.error}</p>}
          </Card>

          <Card title="Rutas y repos">
            <ul className="space-y-3">
              {Object.entries(data.paths).map(([key, entry]) => (
                <li key={key} className="flex items-center gap-3">
                  {entry.exists ? <CircleCheck className="size-5 text-success" aria-hidden /> : <CircleAlert className="size-5 text-warning" aria-hidden />}
                  <span className="w-32 font-medium">{key}</span>
                  <span className="truncate font-mono text-sm text-muted">{entry.value}</span>
                </li>
              ))}
              {data.repos.map((repo) => (
                <li key={repo.name} className="flex items-center gap-3">
                  {repo.exists ? <CircleCheck className="size-5 text-success" aria-hidden /> : <CircleAlert className="size-5 text-warning" aria-hidden />}
                  <span className="w-32 font-medium">repo</span>
                  <span className="font-mono text-sm text-muted">{repo.name}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Link to="/levantado" className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50">
              <Rocket className="mb-3 size-6 text-accent" aria-hidden />
              <div className="font-semibold">Levantar el stack</div>
              <p className="mt-1 text-sm text-muted">MinIO › RabbitMQ y Mongo › servicios, en el orden correcto. Llega en la Fase 1.</p>
            </Link>
            <Link to="/pruebas" className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50">
              <FolderTree className="mb-3 size-6 text-accent" aria-hidden />
              <div className="font-semibold">Pruebas y desarrollo</div>
              <p className="mt-1 text-sm text-muted">Lo que genera el análisis y las pruebas de cada ticket, en un solo lugar. Llega en la Fase 2.</p>
            </Link>
          </div>
        </div>
      )}
    </>
  );
};

