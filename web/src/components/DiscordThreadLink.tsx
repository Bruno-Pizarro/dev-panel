import { ExternalLink, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface ForumThread {
  id: string;
  name: string;
  ticket: string | null;
  tags: string[];
  replies: number;
  lastActivityAt: string;
  approved: boolean;
  link: string;
}
interface ThreadList {
  configured: boolean;
  problem: string | null;
  threads: ForumThread[];
}

// Una sola consulta por pantalla (el servidor ya guarda 5 min): todos los tickets que se miran comparten la misma respuesta.
let pending: Promise<ThreadList> | null = null;
let loadedAt = 0;
const loadThreads = (): Promise<ThreadList> => {
  if (!pending || Date.now() - loadedAt > 60_000) {
    loadedAt = Date.now();
    pending = api.get<ThreadList>('/api/discord/threads').catch(() => ({ configured: false, problem: null, threads: [] }));
  }
  return pending;
};

/** «Hilo en Discord»: el hilo del foro de MRs que tiene el número de este ticket en el título (lo haya creado quien lo haya creado). */
export const DiscordThreadLink = ({ ticket }: { ticket: string | null }) => {
  const [thread, setThread] = useState<ForumThread | null>(null);
  useEffect(() => {
    let active = true;
    setThread(null);
    if (ticket) void loadThreads().then((list) => active && setThread(list.threads.find((item) => item.ticket === ticket) ?? null));
    return () => {
      active = false;
    };
  }, [ticket]);
  if (!thread) return null;
  return (
    <a href={thread.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent" title={`${thread.replies} respuesta${thread.replies === 1 ? '' : 's'}${thread.approved ? ' · aprobado (Estado: Testeado)' : ''}`} data-testid="discord-thread-link">
      <MessageSquare className="size-4" aria-hidden />Hilo en Discord{thread.approved ? ' · aprobado' : ''}<ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
};
