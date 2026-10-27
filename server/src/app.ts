import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { paths } from './config.js';
import { registerSecurity } from './security.js';
import { registerSse } from './sse.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerContainerRoutes } from './routes/containers.js';
import { registerStartupRoutes } from './routes/startup.js';

export interface AppOptions {
  port: number;
  serveWeb?: boolean;
}

export const buildApp = async ({ port, serveWeb = true }: AppOptions): Promise<FastifyInstance> => {
  const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } });
  registerSecurity(app, port);
  registerSse(app);
  registerSystemRoutes(app);
  registerContainerRoutes(app);
  registerStartupRoutes(app);

  if (serveWeb && existsSync(paths.web)) {
    await app.register(fastifyStatic, { root: paths.web });
    // Fallback del router del frontend: toda ruta que no sea de la API devuelve index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' });
      return reply.sendFile('index.html');
    });
  }
  return app;
};
