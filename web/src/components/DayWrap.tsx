import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ACHIEVEMENT_BY_ID } from '../lib/rewards/achievements';
import { closingLine, DAY_WRAP_EVENT, dayLevel, wrapText } from '../lib/rewards/dayWrap';
import { faceOf, mascotById } from '../lib/rewards/mascots';
import { RECORDS } from '../lib/rewards/records';
import { useGame } from '../lib/rewards/gameStore';
import type { RewardFacts } from '../lib/rewards/types';
import { Button } from './Button';
import { FillBar } from './FillBar';
import { Modal } from './Modal';
import { useToast } from './Toast';

const tokens = (value: number): string => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M` : value >= 1000 ? `${Math.round(value / 1000)} k` : String(value));

const Row = ({ emoji, label, value }: { emoji: string; label: string; value: React.ReactNode }) => (
  <li className="flex items-center gap-3 py-2">
    <span className="w-7 text-center text-xl" aria-hidden>{emoji}</span>
    <span className="flex-1 text-muted">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </li>
);

/**
 * «Tu día en 10 segundos»: una tarjeta que cierra la jornada con lo que hiciste (commits, tickets, agentes, tokens, checklist, logros y récords del
 * día) y una frase. Aparece sola pasada la hora de salida (una vez por día) o cuando la pedís; los viernes suma la semana. Todo sale de datos locales.
 */
export const DayWrap = () => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState<RewardFacts | null>(null);
  const [line, setLine] = useState('');
  const { prefs, state: game } = useGame();

  useEffect(() => {
    const show = () => {
      setOpen(true);
      api.get<RewardFacts>('/api/rewards/facts').then(setFacts, () => setFacts(null));
    };
    window.addEventListener(DAY_WRAP_EVENT, show);
    return () => window.removeEventListener(DAY_WRAP_EVENT, show);
  }, []);

  const earned = game.today.day === facts?.day ? game.today.earned : [];
  useEffect(() => {
    if (facts) setLine(closingLine(dayLevel(facts, earned.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts]);

  if (!open) return null;
  const mascot = mascotById(prefs.mascotId);
  const names = earned.map((id) => ACHIEVEMENT_BY_ID[id]?.name).filter((name): name is string => Boolean(name));
  const recordKeys = game.today.day === facts?.day ? game.today.recordsAnnounced : [];
  const friday = facts?.weekday === 5;
  return (
    <Modal
      open
      title="Tu día en 10 segundos"
      onClose={() => setOpen(false)}
      footer={
        <>
          {facts && <Button icon={<Copy className="size-4" />} onClick={() => void navigator.clipboard.writeText(wrapText(facts, names, line)).then(() => toast('success', 'Resumen copiado: pegalo en el daily.'))}>Copiar resumen</Button>}
          <Button variant="primary" icon={<Check className="size-4" />} onClick={() => setOpen(false)}>Cerrar el día</Button>
        </>
      }
    >
      {!facts ? <p className="text-muted">Juntando tu día…</p> : (
        <div className="space-y-4" data-testid="day-wrap">
          <div className="flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-3">
            <span className="text-4xl" aria-hidden>{prefs.mascot ? faceOf(mascot, 'happy') : '🎉'}</span>
            <p className="text-base font-semibold leading-snug">{line}</p>
          </div>
          <ul className="divide-y divide-line">
            <Row emoji="🔨" label="Commits" value={`${facts.commits.today}${facts.commits.firstToday ? ` · de ${facts.commits.firstToday} a ${facts.commits.lastToday}` : ''}`} />
            {facts.ticketsToday.length > 0 && <Row emoji="🎫" label="Tickets tocados" value={facts.ticketsToday.map((ticket) => `#${ticket}`).join(', ')} />}
            <Row emoji="🤖" label="Agentes de Claude" value={`${facts.agents.today}${facts.agents.maxParallelToday > 1 ? ` · hasta ${facts.agents.maxParallelToday} a la vez` : ''}`} />
            <Row emoji="🪙" label="Tokens" value={tokens(facts.agents.tokensToday)} />
            {facts.services && <Row emoji="🧱" label="Servicios" value={`${facts.services.running}/${facts.services.total} arriba`} />}
          </ul>
          {facts.checklist.total > 0 && <FillBar label="Checklist del día" value={facts.checklist.done} max={facts.checklist.total} />}
          {names.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wider text-muted">Logros de hoy</h3>
              <ul className="flex flex-wrap gap-2">
                {earned.map((id) => ACHIEVEMENT_BY_ID[id] && <li key={id} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm" title={ACHIEVEMENT_BY_ID[id]!.desc}>{ACHIEVEMENT_BY_ID[id]!.emoji} {ACHIEVEMENT_BY_ID[id]!.name}</li>)}
              </ul>
            </section>
          )}
          {recordKeys.length > 0 && (
            <p className="text-sm text-warning">🏅 Récords de hoy: {recordKeys.map((key) => RECORDS.find((record) => record.key === key)?.label).filter(Boolean).join(', ')}</p>
          )}
          {friday && (
            <section className="rounded-xl border border-line bg-surface-2 px-4 py-3" data-testid="day-wrap-week">
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted">Tu semana</h3>
              <p className="text-sm">🔨 {facts.commits.week} commits · 🪙 {tokens(facts.agents.tokensWeek)} tokens en 7 días. ¡Buen viernes!</p>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};
