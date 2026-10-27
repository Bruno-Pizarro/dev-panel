import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { tint } from '../lib/colors';
import type { ClaudeUsage } from '../lib/types';
import { UsageBar } from './UsageBar';

const ago = (seconds: number) => (seconds < 90 ? 'recién' : seconds < 3600 ? `hace ${Math.round(seconds / 60)} min` : `hace ${Math.round(seconds / 3600)} h`);
const STALE_SECONDS = 20 * 60;

/** Uso de la cuenta activa de Claude en el navbar: sesión de 5 h y semana. Se oculta si todavía no hay datos del colector. */
export const ClaudeUsageBar = () => {
  const data = usePolling(() => api.get<{ account: { id: string; label: string; color: string } | null; usage: ClaudeUsage | null; problem: string | null }>('/api/claude/active-usage'), 30_000);
  const account = data.data?.account;
  const usage = data.data?.usage;
  if (!account) return null;
  const sources = { cache: 'caché de Claude Code', statusline: 'statusLine', live: 'consulta en vivo' } as const;
  const title = `${usage ? `Último dato ${ago(usage.ageSeconds)} (${sources[usage.source]})` : 'Todavía no hay datos de uso: abrí “Account & usage” en Claude Code'}${data.data?.problem ? ` · En vivo: ${data.data.problem}` : ''}`;
  return (
    <Link to="/claude" className="flex items-center gap-4 rounded-xl border border-line bg-surface-2 px-3.5 py-1.5 transition-colors hover:border-accent/40" title={title}>
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: tint(account.color, 0.95) }} aria-hidden />
        <span className="max-w-32 truncate">{account.label}</span>
      </span>
      {usage && (usage.fiveHour || usage.sevenDay) ? (
        <>
          <UsageBar label="Sesión 5 h" window={usage.fiveHour} compact />
          <UsageBar label="Semana" window={usage.sevenDay} compact />
          <span className={usage.ageSeconds > STALE_SECONDS ? 'whitespace-nowrap text-sm text-warning' : 'whitespace-nowrap text-sm text-muted'}>{ago(usage.ageSeconds)}</span>
        </>
      ) : (
        <span className="text-sm text-muted">sin datos de uso</span>
      )}
    </Link>
  );
};
