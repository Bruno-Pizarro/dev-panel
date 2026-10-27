import { spawn } from 'node:child_process';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { NAME_PATTERN, listContainers, readLogs, readTscStatus, restartContainer, type TscStatus } from '../services/containers.js';

const tailSchema = z.coerce.number().int().min(1).max(5000).default(300);
const confirmSchema = z.object({ confirm: z.literal(true) });

/** El nombre debe ser un contenedor existente: nunca se pasa texto libre a `docker`. */
const existingContainer = async (name: string, reply: FastifyReply): Promise<string | null> => {
  if (NAME_PATTERN.test(name) && (await listContainers()).some((container) => container.name === name)) return name;
  void reply.code(404).send({ error: 'Contenedor no encontrado' });
  return null;
};

export const registerContainerRoutes = (app: FastifyInstance): void => {
  /** Contenedores con su posición en el orden de levantado (MinIO, infraestructura, obligatorios, opcionales). */
  app.get('/api/containers', async () => {
    const containers = await listContainers();
    const state = loadConfig();
    const order = state.configured
      ? [...state.config.startup.stage1, ...state.config.startup.stage2, ...Object.values(state.config.startup.groups).flatMap((group) => group.withStage2), ...state.config.startup.mandatory, ...state.config.startup.optional]
      : [];
    return { containers: containers.map((container) => ({ ...container, rank: container.service && order.includes(container.service) ? order.indexOf(container.service) : order.length })) };
  });

  /** Estado de `tsc` de los contenedores en ejecución (lento, por eso va aparte del listado). */
  app.get('/api/containers/tsc', async () => {
    const running = (await listContainers()).filter((container) => container.state === 'running');
    const result: Record<string, TscStatus> = {};
    const queue = [...running];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) result[next.name] = await readTscStatus(next.name);
      }),
    );
    return { tsc: result };
  });

  app.get<{ Params: { name: string }; Querystring: { tail?: string } }>('/api/containers/:name/logs', async (request, reply) => {
    const name = await existingContainer(request.params.name, reply);
    if (!name) return reply;
    const tail = tailSchema.parse(request.query.tail);
    return { logs: await readLogs(name, tail) };
  });

  /** Logs en vivo por SSE: `docker logs -f` mientras la pestaña siga conectada. */
  app.get<{ Params: { name: string } }>('/api/containers/:name/stream', async (request, reply) => {
    const name = await existingContainer(request.params.name, reply);
    if (!name) return reply;
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const child = spawn('docker', ['logs', '-f', '--tail', '200', name]);
    const send = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) reply.raw.write(`data: ${JSON.stringify(line)}\n\n`);
    };
    child.stdout.on('data', send);
    child.stderr.on('data', send);
    child.on('close', () => reply.raw.end());
    request.raw.on('close', () => child.kill());
    reply.hijack();
    return reply;
  });

  app.post<{ Params: { name: string } }>('/api/containers/:name/restart', async (request, reply) => {
    if (!confirmSchema.safeParse(request.body).success) return reply.code(400).send({ error: 'Falta la confirmación' });
    const name = await existingContainer(request.params.name, reply);
    if (!name) return reply;
    const result = await restartContainer(name);
    return result.ok ? { ok: true } : reply.code(500).send({ error: result.stderr || 'No se pudo reiniciar' });
  });
};
