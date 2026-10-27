import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listDir, pickPath } from '../services/fsPicker.js';

export const registerFsRoutes = (app: FastifyInstance): void => {
  /** Abre el selector de archivos/carpetas del sistema operativo y devuelve la ruta elegida. */
  app.post('/api/fs/pick', async (request, reply) => {
    const body = z.object({ kind: z.enum(['folder', 'file']), initial: z.string().max(1000).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Pedido inválido' });
    return pickPath(body.data.kind, body.data.initial ?? null);
  });

  app.get<{ Querystring: { path?: string; files?: string } }>('/api/fs/list', async (request, reply) => {
    try {
      return listDir(request.query.path || '~', request.query.files === '1');
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
};
