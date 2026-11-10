import { allNavItems } from './nav';

/**
 * Atajos de teclado del panel. Cada acción tiene una tecla por defecto que el usuario puede cambiar (se guarda en el navegador).
 * `main`: se pulsa sola; `goto`: va después de la tecla "ir a…" (por defecto `g`), como en GitHub (g + i = Inicio).
 */
export type ShortcutContext = 'main' | 'goto';

export interface ShortcutDef {
  id: string;
  label: string;
  group: string;
  defaultKey: string;
  /** Teclas alternativas fijas (no se cambian): por ejemplo las flechas junto a A y D. */
  alt: string[];
  context: ShortcutContext;
}

export const NUMBER_TABS_ID = 'tabs.number';
export const GOTO_PREFIX_ID = 'goto.prefix';
export const HELP_ID = 'help';
export const GOTO_PREFIX = 'go:';

/** Letra por defecto de cada destino del menú (después de `g`). */
const GOTO_DEFAULTS: Record<string, string> = {
  '/': 'i', '/servicios': 's', '/levantado': 'l', '/datos': 't', '/sesiones': 'e', '/entorno': 'r',
  '/kanban': 'k', '/pruebas': 'p', '/planificacion': 'd', '/daily': 'y', '/agentes': 'a', '/logros': 'h', '/claude': 'c', '/configuracion': 'o',
};

const MAIN_DEFS: ShortcutDef[] = [
  { id: 'tabs.prev', label: 'Pestaña anterior', group: 'Pestañas', defaultKey: 'a', alt: ['ArrowLeft'], context: 'main' },
  { id: 'tabs.next', label: 'Pestaña siguiente', group: 'Pestañas', defaultKey: 'd', alt: ['ArrowRight'], context: 'main' },
  { id: 'ticket.prev', label: 'Ticket anterior de la lista', group: 'Tickets', defaultKey: 'w', alt: [], context: 'main' },
  { id: 'ticket.next', label: 'Ticket siguiente de la lista', group: 'Tickets', defaultKey: 's', alt: [], context: 'main' },
  { id: 'frame.full', label: 'Pantalla completa del ticket', group: 'Ticket abierto', defaultKey: 'f', alt: [], context: 'main' },
  { id: 'refresh', label: 'Actualizar', group: 'Ticket abierto', defaultKey: 'r', alt: [], context: 'main' },
  { id: 'changes.prev', label: 'Archivo anterior', group: 'Pestaña Cambios', defaultKey: 'p', alt: [], context: 'main' },
  { id: 'changes.next', label: 'Archivo siguiente', group: 'Pestaña Cambios', defaultKey: 'n', alt: [], context: 'main' },
  { id: 'changes.viewed', label: 'Marcar el archivo como visto (y pasar al siguiente sin ver)', group: 'Pestaña Cambios', defaultKey: 'v', alt: [], context: 'main' },
  { id: 'changes.expand', label: 'Expandir o contraer todos los archivos', group: 'Pestaña Cambios', defaultKey: 'e', alt: [], context: 'main' },
  { id: 'agents.toggle', label: 'Mostrar u ocultar los agentes de Claude', group: 'Agentes', defaultKey: 'h', alt: [], context: 'main' },
  { id: 'home.dismiss', label: 'Ocultar por hoy el primer aviso', group: 'Inicio', defaultKey: 'x', alt: [], context: 'main' },
  { id: 'home.recheck', label: 'Volver a revisar los avisos', group: 'Inicio', defaultKey: 'b', alt: [], context: 'main' },
  { id: 'home.reminders', label: 'Abrir los recordatorios', group: 'Inicio', defaultKey: 'q', alt: [], context: 'main' },
  { id: 'home.weather', label: 'Ver el clima (pide la ubicación)', group: 'Inicio', defaultKey: 'c', alt: [], context: 'main' },
  { id: 'agents.next', label: 'Agente siguiente de la lista', group: 'Vista Agentes', defaultKey: 'j', alt: [], context: 'main' },
  { id: 'agents.prev', label: 'Agente anterior de la lista', group: 'Vista Agentes', defaultKey: 'k', alt: [], context: 'main' },
  { id: 'agents.open', label: 'Abrir o cerrar el agente elegido', group: 'Vista Agentes', defaultKey: 'o', alt: [], context: 'main' },
  { id: 'agents.active', label: 'Mostrar solo los que trabajan', group: 'Vista Agentes', defaultKey: 't', alt: [], context: 'main' },
  { id: 'dnd.toggle', label: 'No molestar (silenciar los avisos)', group: 'General', defaultKey: 'z', alt: [], context: 'main' },
  { id: GOTO_PREFIX_ID, label: 'Ir a… (después, la letra del destino)', group: 'Navegación', defaultKey: 'g', alt: [], context: 'main' },
  { id: HELP_ID, label: 'Mostrar los atajos', group: 'Navegación', defaultKey: '?', alt: [], context: 'main' },
];

/** Todas las acciones configurables: las fijas y un destino por cada entrada del menú lateral. */
export const buildDefs = (): ShortcutDef[] => [
  ...MAIN_DEFS,
  ...allNavItems.map((item): ShortcutDef => ({ id: `${GOTO_PREFIX}${item.path}`, label: `Ir a ${item.label}`, group: 'Ir a…', defaultKey: GOTO_DEFAULTS[item.path] ?? '', alt: [], context: 'goto' })),
];

export const DEFS: ShortcutDef[] = buildDefs();

export type Bindings = Record<string, string>;

/** Una tecla guardada solo vale si es de un carácter o una flecha. */
export const isValidKey = (key: unknown): key is string => typeof key === 'string' && (key.length === 1 || /^Arrow(Left|Right|Up|Down)$/.test(key));

/** Las teclas efectivas: lo que el usuario cambió (si es válido) o la de por defecto. */
export const resolveBindings = (defs: ShortcutDef[], stored: Bindings | undefined): Bindings =>
  Object.fromEntries(defs.map((def) => [def.id, stored && isValidKey(stored[def.id]) ? normalizeKey(stored[def.id]!) : def.defaultKey]));

export const normalizeKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

const ARROWS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
/** Cómo se dibuja una tecla: letras en mayúscula y flechas como símbolos. */
export const displayKey = (key: string): string => ARROWS[key] ?? (key === ' ' ? 'Espacio' : key.length === 1 ? key.toUpperCase() : key);

/** Una tecla se puede asignar si es una letra, un símbolo o una flecha; los números 1–9 están reservados para las pestañas. */
export const canBind = (key: string): boolean => isValidKey(key) && !/^[1-9]$/.test(key) && key !== ' ';

/** La acción del mismo contexto que ya usa esa tecla (o la tiene como alternativa fija), si hay. */
export const findConflict = (defs: ShortcutDef[], bindings: Bindings, id: string, key: string): ShortcutDef | null => {
  const self = defs.find((def) => def.id === id);
  if (!self) return null;
  const wanted = normalizeKey(key);
  return defs.find((def) => def.id !== id && def.context === self.context && (bindings[def.id] === wanted || def.alt.includes(key))) ?? null;
};

/** La acción de ese contexto que corresponde a la tecla pulsada. */
export const matchAction = (defs: ShortcutDef[], bindings: Bindings, context: ShortcutContext, key: string): ShortcutDef | null => {
  const pressed = normalizeKey(key);
  return defs.find((def) => def.context === context && (bindings[def.id] === pressed || def.alt.includes(key))) ?? null;
};

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** Escribir en un campo de texto nunca dispara atajos. */
export const isEditableTarget = (target: unknown): boolean => {
  const element = target as TargetLike | null;
  if (!element || typeof element !== 'object') return false;
  const tag = (element.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true || element.getAttribute?.('role') === 'textbox';
};

/** Ventanas encima de la pantalla (modales, visor de capturas, diagrama a pantalla completa): ahí las teclas son de la ventana. */
export const BLOCKING_SELECTORS = ['[aria-modal="true"]', '[aria-label="Diagrama a pantalla completa"]', '[aria-label="Visor de capturas"]'];
