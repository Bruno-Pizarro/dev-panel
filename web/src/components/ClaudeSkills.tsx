import { Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/tickets';
import type { ClaudeSkillsResponse } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

const RECENT_MS = 7 * 86_400_000;

const exact = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Skills instaladas en la carpeta de cada cuenta, con la fecha de su última modificación (la de cualquiera de sus archivos). */
export const ClaudeSkills = ({ accounts }: { accounts: Array<{ id: string; label: string }> }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<'todas' | 'user' | 'plugin'>('todas');
  const selected = accountId ?? accounts[0]?.id ?? null;
  const skills = useAsync(() => api.get<ClaudeSkillsResponse>(`/api/claude/skills${selected ? `?id=${encodeURIComponent(selected)}` : ''}`));
  const response = skills.data;
  const list = response?.skills ?? [];
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (response?.skills ?? []).filter((skill) => (origin === 'todas' || skill.source === origin) && (!text || `${skill.id} ${skill.name} ${skill.description}`.toLowerCase().includes(text)));
  }, [response, query, origin]);

  const pick = (id: string) => {
    // Los dos cambios van en el mismo render: la recarga ya lee la cuenta nueva.
    setAccountId(id);
    skills.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-64 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60">
          <Search className="size-4 text-muted" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar skill…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Origen">
          {([['todas', 'Todas'], ['user', 'Propias'], ['plugin', 'De plugins']] as const).map(([id, label]) => (
            <Chip key={id} selected={origin === id} onToggle={() => setOrigin(id)}>{label}</Chip>
          ))}
        </div>
        {accounts.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cuenta">
            {accounts.map((account) => <Chip key={account.id} selected={selected === account.id} onToggle={() => pick(account.id)}>{account.label}</Chip>)}
          </div>
        )}
      </div>
      {skills.loading && !skills.data ? (
        <Skeleton className="h-64" />
      ) : skills.error ? (
        <p className="text-danger">{skills.error}</p>
      ) : list.length === 0 ? (
        <EmptyState icon={<Sparkles className="size-6" />} title="Sin skills">No se encontraron skills (propias ni de plugins) en <span className="font-mono">{skills.data?.dir}</span>.</EmptyState>
      ) : (
        <Card title={`Skills instaladas (${visible.length}${visible.length !== list.length ? ` de ${list.length}` : ''})`} action={<span className="font-mono text-sm text-muted">{skills.data?.dir}</span>}>
          <ul className="divide-y divide-line">
            {visible.map((skill) => {
              const recent = Date.now() - Date.parse(skill.modifiedAt) < RECENT_MS;
              return (
                <li key={skill.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3.5">
                  <div className="min-w-0 flex-1 basis-96">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-medium text-accent">/{skill.id}</span>
                      {skill.plugin && <Badge tone="accent">plugin {skill.plugin}</Badge>}
                      {skill.plugin && !skill.enabled && <Badge tone="warning">desactivado</Badge>}
                      {skill.version && <Badge>v{skill.version}</Badge>}
                      {recent && <Badge tone="success">modificada esta semana</Badge>}
                    </div>
                    {skill.description && <p className="mt-1 line-clamp-2 text-sm text-muted" title={skill.description}>{skill.description}</p>}
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <div className="font-medium" title={exact(skill.modifiedAt)}>{timeAgo(Date.parse(skill.modifiedAt))}</div>
                    <div className="text-muted">{exact(skill.modifiedAt)}</div>
                    <div className="font-mono text-muted" title="Archivo que cambió más recientemente">{skill.modifiedFile}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
};
