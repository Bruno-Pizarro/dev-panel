import type { FastifyReply } from 'fastify';
import { loadConfig, type DevPanelConfig } from '../config.js';

/** Devuelve la configuración o responde 409 si todavía no se hizo el primer arranque. */
export const requireConfig = (reply: FastifyReply): DevPanelConfig | null => {
  const state = loadConfig();
  if (state.configured) return state.config;
  void reply.code(409).send({ error: `Panel sin configurar: ${state.reason}` });
  return null;
};
