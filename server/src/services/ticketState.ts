import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

export type TicketKind = 'desarrollo' | 'revision';

export interface TicketState {
  /** Marcado a mano en el panel: el desarrollo está listo para pasar a pruebas. */
  readyForTests?: boolean;
  readyAt?: string;
  /** Lo marcado en el panel manda sobre `tipo` de ticket.json. */
  kind?: TicketKind;
}

const file = () => join(paths.data, 'ticket-state.json');
const readAll = (): Record<string, TicketState> => {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, TicketState>) : {};
  } catch {
    return {};
  }
};

export const getTicketState = (dir: string): TicketState => readAll()[dir] ?? {};

export const setTicketState = (dir: string, patch: { ready?: boolean | undefined; kind?: TicketKind | undefined }, now = new Date()): TicketState => {
  const all = readAll();
  const current = all[dir] ?? {};
  const next: TicketState = { ...current };
  if (patch.ready !== undefined) {
    next.readyForTests = patch.ready;
    if (patch.ready) next.readyAt = now.toISOString();
    else delete next.readyAt;
  }
  if (patch.kind !== undefined) next.kind = patch.kind;
  all[dir] = next;
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(all, null, 2), { mode: 0o600 });
  renameSync(`${file()}.tmp`, file());
  return next;
};

/** Un ticket solo de revisión nunca es "desarrollo propio": el panel lo marcado manda; luego ticket.json; por defecto, desarrollo. */
export const kindOf = (state: TicketState, tipo: string | undefined): TicketKind => state.kind ?? (tipo === 'revision' ? 'revision' : 'desarrollo');
