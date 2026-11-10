import { Bot, Boxes, KanbanSquare, LogIn, CalendarDays, ClipboardCheck, ListTree, Database, FileCog, Home, Layers, Rocket, Settings, ShieldCheck, type LucideIcon, Trophy } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Fase del plan en la que la vista se construye; `null` = ya disponible. */
  phase: number | null;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  { label: 'General', items: [{ path: '/', label: 'Inicio', description: 'Estado del entorno de un vistazo', icon: Home, phase: null }] },
  {
    label: 'Entorno',
    items: [
      { path: '/servicios', label: 'Servicios', description: 'Contenedores, logs y reinicio', icon: Boxes, phase: null },
      { path: '/levantado', label: 'Levantado', description: 'Levantar el stack en el orden correcto', icon: Rocket, phase: null },
      { path: '/datos', label: 'Datos', description: 'Snapshots y backups con chips', icon: Database, phase: null },
      { path: '/sesiones', label: 'Sesiones de prueba', description: 'Entrar como un usuario del entorno local', icon: LogIn, phase: null },
      { path: '/entorno', label: 'Repos y .env', description: 'Perfiles de .env y chequeos', icon: FileCog, phase: null },
    ],
  },
  {
    label: 'Trabajo',
    items: [
      { path: '/kanban', label: 'Kanban', description: 'Tickets de Redmine por estado', icon: KanbanSquare, phase: null },
      { path: '/pruebas', label: 'Pruebas', description: 'Pruebas realizadas por ticket', icon: ClipboardCheck, phase: null },
      { path: '/planificacion', label: 'Desarrollo', description: 'Análisis, plan y diagramas de cada desarrollo', icon: Layers, phase: null },
      { path: '/daily', label: 'Daily', description: 'Resumen diario de trabajo', icon: CalendarDays, phase: null },
      { path: '/agentes', label: 'Agentes', description: 'Subagentes de Claude, por sesión', icon: ListTree, phase: null },
      { path: '/logros', label: 'Logros', description: 'Tus logros con humor, récords y números', icon: Trophy, phase: null },
    ],
  },
  { label: 'Sistema', items: [
      { path: '/claude', label: 'Claude', description: 'Cuentas, uso y skills', icon: Bot, phase: null },{ path: '/configuracion', label: 'Configuración', description: 'Rutas, servicios y presets', icon: Settings, phase: null }] },
];

export const allNavItems = navGroups.flatMap((group) => group.items);
export const brandIcon = ShieldCheck;

/** Destinos que no se pueden quitar del menú lateral (sin ellos no se llega a la configuración ni a Claude). */
export const LOCKED_NAV_PATHS: readonly string[] = ['/', '/claude', '/configuracion'];
export const HIDDEN_NAV_KEY = 'dev-panel.nav.hidden';

/** Menú con lo que el usuario quitó ya aplicado: los destinos bloqueados nunca se ocultan y un grupo sin items desaparece. */
export const visibleNavGroups = (hidden: readonly string[]): NavGroup[] =>
  navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => LOCKED_NAV_PATHS.includes(item.path) || !hidden.includes(item.path)) }))
    .filter((group) => group.items.length > 0);
