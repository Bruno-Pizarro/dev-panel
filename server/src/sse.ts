import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';

/** Bus de eventos en memoria: los servicios publican y las conexiones SSE los reenvían al navegador. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export interface PanelEvent {
  channel: string;
  data: unknown;
}

export const publish = (channel: string, data: unknown): void => {
  bus.emit('event', { channel, data } satisfies PanelEvent);
};

export const registerSse = (app: FastifyInstance, heartbeatMs = 15_000): void => {
  app.get('/api/events', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write('retry: 3000\n\n');
    const onEvent = (event: PanelEvent) => reply.raw.write(`event: ${event.channel}\ndata: ${JSON.stringify(event.data)}\n\n`);
    bus.on('event', onEvent);
    const timer = setInterval(() => reply.raw.write(': ping\n\n'), heartbeatMs);
    request.raw.on('close', () => {
      clearInterval(timer);
      bus.off('event', onEvent);
    });
    reply.hijack();
  });
};
