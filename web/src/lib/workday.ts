export type Urgency = 'none' | 'soft' | 'medium' | 'high';

/** Colores (canales RGB) de cada nivel: ámbar, naranja y rojo. */
export const URGENCY_RGB: Record<Exclude<Urgency, 'none'>, string> = { soft: '229 169 59', medium: '251 146 60', high: '240 98 108' };

const toMinutes = (hhmm: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Minutos que pasaron desde el horario configurado (negativo = todavía falta). `null` si no hay horario o es fin de semana:
 * ahí el checklist no se colorea.
 */
export const minutesSince = (target: string, now: Date): number | null => {
  const minutes = toMinutes(target);
  if (minutes === null || now.getDay() === 0 || now.getDay() === 6) return null;
  return now.getHours() * 60 + now.getMinutes() - minutes;
};

/** Hasta 15 min tarde: ámbar; hasta 1 h: naranja; más de 1 h: rojo. Antes del horario (o sin horario): sin color. */
export const urgencyOf = (late: number | null): Urgency => (late === null || late <= 0 ? 'none' : late <= 15 ? 'soft' : late <= 60 ? 'medium' : 'high');

export interface ItemUrgency {
  urgency: Urgency;
  /** Texto corto para mostrar junto al paso, ej. "25 min tarde". */
  note: string | null;
}

export const lateText = (late: number): string => (late < 60 ? `${late} min tarde` : `${Math.floor(late / 60)} h ${late % 60 ? `${late % 60} min ` : ''}tarde`);

/**
 * Urgencia de un paso del checklist diario:
 *  - marcar entrada / salida: según el tiempo desde el horario configurado;
 *  - cargar horas: en rojo en cuanto se marcó la salida y todavía no se cargaron.
 * Un paso ya hecho nunca se colorea (se ve en verde).
 */
export const itemUrgency = (id: string, done: boolean, items: Array<{ id: string; done: boolean }>, workday: { entry: string; exit: string }, now: Date): ItemUrgency => {
  if (done) return { urgency: 'none', note: null };
  if (id === 'cargar-horas') return items.some((item) => item.id === 'marcar-salida' && item.done) ? { urgency: 'high', note: 'ya marcaste salida' } : { urgency: 'none', note: null };
  const target = id === 'marcar-entrada' ? workday.entry : id === 'marcar-salida' ? workday.exit : '';
  if (!target) return { urgency: 'none', note: null };
  const late = minutesSince(target, now);
  const urgency = urgencyOf(late);
  return { urgency, note: urgency === 'none' || late === null ? null : lateText(late) };
};
