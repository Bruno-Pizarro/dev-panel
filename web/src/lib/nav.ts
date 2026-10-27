import { Boxes, CalendarDays, ClipboardCheck, Database, FileCog, Home, Layers, Rocket, Settings, ShieldCheck, type LucideIcon } from 'lucide-react';

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
      { path: '/datos', label: 'Datos', description: 'Snapshots y backups con chips', icon: Database, phase: 3 },
      { path: '/entorno', label: 'Repos y .env', description: 'Perfiles de .env y chequeos', icon: FileCog, phase: 3 },
    ],
  },
  {
    label: 'Trabajo',
    items: [
      { path: '/pruebas', label: 'Pruebas', description: 'Pruebas realizadas por ticket', icon: ClipboardCheck, phase: 2 },
      { path: '/planificacion', label: 'Planificación', description: 'Análisis, plan y diagramas', icon: Layers, phase: 2 },
      { path: '/daily', label: 'Daily', description: 'Resumen diario de trabajo', icon: CalendarDays, phase: 3 },
    ],
  },
  { label: 'Sistema', items: [{ path: '/configuracion', label: 'Configuración', description: 'Rutas, servicios y presets', icon: Settings, phase: null }] },
];

export const allNavItems = navGroups.flatMap((group) => group.items);
export const brandIcon = ShieldCheck;
