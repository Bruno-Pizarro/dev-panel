import { Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip } from '../components/Chip';
import { FillBar } from '../components/FillBar';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/cn';
import { useStoredState } from '../lib/hooks';
import { ACHIEVEMENTS, type Achievement } from '../lib/rewards/achievements';
import { RECORDS } from '../lib/rewards/records';
import { EMPTY_GAME, type GameState } from '../lib/rewards/types';
import { useTabParam } from '../lib/urlState';
import { Tabs } from '../components/Tabs';

type Tab = 'logros' | 'records' | 'numeros';
type Filter = 'all' | 'won' | 'todo';

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const Card = ({ achievement, state, today }: { achievement: Achievement; state: GameState; today: boolean }) => {
  const won = state.unlocked[achievement.id];
  const hidden = achievement.secret && !won;
  return (
    <li className={cn('flex gap-3 rounded-xl border p-3.5', won ? 'border-accent/40 bg-surface' : 'border-line bg-surface/60')} data-testid="achievement" data-won={won ? 'yes' : 'no'}>
      <span className={cn('text-3xl leading-none', !won && 'opacity-40 grayscale')} aria-hidden>{hidden ? '❔' : achievement.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-semibold">{hidden ? '???' : achievement.name}</span>
          {today && <span className="rounded-full bg-success/15 px-2 py-0.5 text-sm font-medium text-success">hoy</span>}
          {achievement.kind === 'daily' && <span className="rounded-full bg-info/15 px-2 py-0.5 text-sm text-info" title="Se puede ganar todos los días">diario</span>}
          {achievement.secret && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-sm text-warning">secreto</span>}
        </div>
        <p className="text-sm leading-snug text-muted">{hidden ? 'Un logro secreto. Seguí usando el panel y capaz lo encontrás.' : achievement.desc}</p>
        {won && <p className="mt-1 text-sm text-muted">{achievement.kind === 'daily' ? `Ganado ×${won.count} · última vez ${dateOf(won.last)}` : `Ganado el ${dateOf(won.first)}`}</p>}
      </div>
    </li>
  );
};

/** La vitrina: tus logros (diarios, de toda la vida y secretos), récords personales y números. Todo sale de lo que recuerda este navegador. */
export const Achievements = () => {
  const [game] = useStoredState<GameState>('dev-panel.game.state', EMPTY_GAME);
  const state: GameState = { ...EMPTY_GAME, ...game };
  const [tab, setTab] = useTabParam<Tab>(['logros', 'records', 'numeros'], 'logros');
  const [filter, setFilter] = useState<Filter>('all');
  const won = ACHIEVEMENTS.filter((achievement) => state.unlocked[achievement.id]).length;
  const earnedToday = new Set(state.today.earned);
  const visible = useMemo(() => ACHIEVEMENTS.filter((achievement) => (filter === 'all' ? true : filter === 'won' ? state.unlocked[achievement.id] : !state.unlocked[achievement.id])), [filter, state.unlocked]);
  const groups: Array<{ title: string; items: Achievement[] }> = [
    { title: 'Ganados hoy', items: visible.filter((achievement) => earnedToday.has(achievement.id)) },
    { title: 'Diarios', items: visible.filter((achievement) => achievement.kind === 'daily' && !achievement.secret && !earnedToday.has(achievement.id)) },
    { title: 'De toda la vida', items: visible.filter((achievement) => achievement.kind === 'lifetime' && !achievement.secret && !earnedToday.has(achievement.id)) },
    { title: 'Secretos', items: visible.filter((achievement) => achievement.secret && !earnedToday.has(achievement.id)) },
  ];
  const c = state.counters;
  const numbers: Array<[string, string, number]> = [['🤖', 'Agentes lanzados', c.agents], ['🔨', 'Commits contados', c.commits], ['📆', 'Días con actividad', c.activeDays], ['✅', 'Días con el checklist completo', c.checklistDays], ['🎉', 'Festejos', c.celebrations], ['🏅', 'Récords rotos', c.recordsBroken], ['🏆', 'Logros ganados', won]];
  return (
    <>
      <PageHeader title="Logros" description="Tus logros con humor, tus récords y tus números. Todo lo recuerda este navegador: no sale de tu máquina." />
      <div className="mb-6 max-w-xl"><FillBar label="Logros ganados" value={won} max={ACHIEVEMENTS.length} valueLabel={`${won} de ${ACHIEVEMENTS.length}`} /></div>
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'logros', label: 'Logros', count: won }, { id: 'records', label: 'Récords' }, { id: 'numeros', label: 'Números' }]} />
      {tab === 'logros' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar logros">
            <Chip selected={filter === 'all'} onToggle={() => setFilter('all')}>Todos ({ACHIEVEMENTS.length})</Chip>
            <Chip selected={filter === 'won'} onToggle={() => setFilter('won')}>Ganados ({won})</Chip>
            <Chip selected={filter === 'todo'} onToggle={() => setFilter('todo')}>Por ganar ({ACHIEVEMENTS.length - won})</Chip>
          </div>
          {groups.filter((group) => group.items.length > 0).map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted"><Trophy className="size-4" aria-hidden />{group.title} <span className="font-normal">({group.items.length})</span></h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{group.items.map((achievement) => <Card key={achievement.id} achievement={achievement} state={state} today={earnedToday.has(achievement.id)} />)}</ul>
            </section>
          ))}
          {visible.length === 0 && <p className="text-muted">Nada por acá todavía.</p>}
        </div>
      )}
      {tab === 'records' && (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="records">
          {RECORDS.map((def) => {
            const record = state.records[def.key];
            return (
              <li key={def.key} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
                <span className={cn('text-3xl', !record && 'opacity-40 grayscale')} aria-hidden>{def.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{def.label}</p>
                  <p className="text-sm text-muted">{record ? `Marca del ${dateOf(`${record.day}T12:00:00`)}` : 'Todavía sin marca'}</p>
                </div>
                <span className="font-mono text-xl font-semibold tabular-nums">{record ? def.format(record.value) : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {tab === 'numeros' && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {numbers.map(([emoji, label, value]) => (
            <li key={label} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <span className="text-3xl" aria-hidden>{emoji}</span>
              <span className="flex-1 text-muted">{label}</span>
              <span className="font-mono text-xl font-semibold tabular-nums">{value.toLocaleString('es-AR')}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
