import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export interface Job {
  id: string;
  title: string;
  lines: string[];
  done: boolean;
  ok: boolean | null;
  startedAt: number;
  listeners: Set<(event: string, data: unknown) => void>;
}

const MAX_JOBS = 30;
const jobs = new Map<string, Job>();

/** Trabajo largo con salida en vivo: corre en segundo plano y el navegador lo sigue por SSE. */
export const createJob = (title: string, worker: (log: (line: string) => void) => Promise<void>): Job => {
  const job: Job = { id: randomBytes(6).toString('hex'), title, lines: [], done: false, ok: null, startedAt: Date.now(), listeners: new Set() };
  const emit = (event: string, data: unknown) => job.listeners.forEach((listener) => listener(event, data));
  const log = (line: string) => {
    job.lines.push(line);
    emit('line', line);
  };
  jobs.set(job.id, job);
  if (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value as string);

  void Promise.resolve()
    .then(() => worker(log))
    .then(() => {
      job.ok = true;
    })
    .catch((error: Error) => {
      job.ok = false;
      log(`ERROR: ${error.message}`);
    })
    .finally(() => {
      job.done = true;
      emit('done', { ok: job.ok });
    });
  return job;
};

export const registerJobRoutes = (app: FastifyInstance): void => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id/stream', async (request, reply) => {
    const job = jobs.get(request.params.id);
    if (!job) return reply.code(404).send({ error: 'Trabajo inexistente' });
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    job.lines.forEach((line) => send('line', line));
    if (job.done) {
      send('done', { ok: job.ok });
      reply.raw.end();
      reply.hijack();
      return reply;
    }
    const listener = (event: string, data: unknown) => {
      send(event, data);
      if (event === 'done') reply.raw.end();
    };
    job.listeners.add(listener);
    request.raw.on('close', () => job.listeners.delete(listener));
    reply.hijack();
    return reply;
  });
};
