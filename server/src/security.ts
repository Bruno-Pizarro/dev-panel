import type { FastifyInstance } from 'fastify';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defensa de un panel que solo escucha en la máquina local:
 *  - Host: solo localhost/127.0.0.1 con el puerto propio (evita DNS rebinding).
 *  - Origin (si viene): debe ser uno de esos hosts o el servidor de desarrollo de Vite.
 *  - Escrituras: exigen la cabecera `X-Dev-Panel: 1`, que un formulario cruzado no puede enviar.
 */
export const registerSecurity = (app: FastifyInstance, port: number, devWebPort = 5173): void => {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts, `127.0.0.1:${devWebPort}`, `localhost:${devWebPort}`]);

  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host ?? '';
    if (!hosts.has(host)) return reply.code(403).send({ error: 'Host no permitido' });

    const origin = request.headers.origin;
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        return reply.code(403).send({ error: 'Origin inválido' });
      }
      if (!origins.has(originHost)) return reply.code(403).send({ error: 'Origin no permitido' });
    }

    if (WRITE_METHODS.has(request.method) && request.headers['x-dev-panel'] !== '1') {
      return reply.code(403).send({ error: 'Falta la cabecera X-Dev-Panel' });
    }
  });
};
