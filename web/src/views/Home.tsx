import { CircleAlert, CircleCheck, FolderTree, Moon, Rocket, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { CheckList } from '../components/CheckList';
import { DailyChecklistCard } from '../components/DailyChecklistCard';
import { HomeNotices } from '../components/HomeNotices';
import { WeatherBadge } from '../components/WeatherBadge';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { StatusDot } from '../components/StatusDot';
import { api } from '../lib/api';
import type { Check, DevPanelConfig, SetupDetect } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { contextFromNotices, pickGreeting, slotOf, type GreetingContext, type Slot } from '../lib/greetings';
import { useHomeNotices, type HomeNoticesState } from '../lib/useHomeNotices';

const SLOT_ICONS: Record<Slot, LucideIcon> = { madrugada: Moon, manana: Sunrise, mediodia: Sun, tarde: Sunset, noche: Moon };
const LAST_GREETING_KEY = 'dev-panel.greeting.last';

/** Saludo simpático según la hora; una vez por visita, distinto del anterior. Las frases con nombre solo salen si hay nombre configurado. */
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const Greeting = ({ name, notices }: { name: string; notices: HomeNoticesState }) => {
  const context = useMemo<GreetingContext | null>(() => (notices.report ? contextFromNotices([...notices.report.routines, ...notices.report.notices], todayIso()) : null), [notices.report]);
  const [text, setText] = useState(() => {
    const now = new Date();
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_GREETING_KEY);
    } catch {
      /* sin almacenamiento */
    }
    const picked = pickGreeting(now, name, Math.random, last);
    try {
      window.localStorage.setItem(LAST_GREETING_KEY, picked);
    } catch {
      /* sin almacenamiento */
    }
    return picked;
  });
  // Con los avisos ya cargados, si hay algo para mencionar (feriado, algo importante) el saludo se vuelve a elegir una sola vez.
  const [adjusted, setAdjusted] = useState(false);
  useEffect(() => {
    if (!context || adjusted) return;
    setAdjusted(true);
    const relevant = context.holiday || (context.important ?? 0) > 0 || (context.dueSoon ?? 0) > 0 || (context.reviews ?? 0) > 0 || context.sprintLastDay || (context.mrProblems ?? 0) > 0;
    if (relevant) setText(pickGreeting(new Date(), name, Math.random, text, context));
  }, [context, adjusted, name, text]);
  const Icon = SLOT_ICONS[slotOf(new Date().getHours())];
  if (!text) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-line bg-gradient-to-r from-accent/10 to-transparent px-5 py-4">
      <p className="flex min-w-0 flex-1 items-center gap-3 text-lg font-medium" data-testid="greeting">
        <Icon className="size-6 shrink-0 text-accent" aria-hidden />
        <span>{text}</span>
      </p>
      <WeatherBadge />
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
      <Greeting name={config.userName} notices={notices} />
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

