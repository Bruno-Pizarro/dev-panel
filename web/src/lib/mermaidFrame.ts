/** Alto mínimo del marco de un diagrama dibujado dentro de un documento. */
export const MIN_FRAME_PX = 360;
/** Margen interior del marco alrededor del diagrama. */
export const FRAME_PADDING = 48;
/** Alto que ocupan la ayuda y la barra de zoom sobre el borde inferior: el diagrama se ajusta por encima para que no los tapen. */
export const OVERLAY_RESERVE = 64;
/** Por debajo de este ancho el marco es "angosto": se oculta la ayuda y la barra se compacta. */
export const NARROW_FRAME_PX = 520;
const MAX_FIT_SCALE = 1.6;

export interface FrameFit {
  /** Alto del marco: se adapta al diagrama en vez de ocupar siempre el 78 % de la ventana. */
  height: number;
  /** Escala con la que el diagrama entra completo en el marco. */
  scale: number;
}

/**
 * Cómo se ajusta un diagrama a un marco de `areaWidth` px: se escala para que entre a lo ancho, el alto del marco sale del
 * alto resultante (entre el mínimo y el 78 % de la ventana) y, si ese tope no alcanza, se achica más para que no se recorte.
 */
export const fitFrame = (natural: { width: number; height: number }, areaWidth: number, viewportHeight: number): FrameFit => {
  const widthScale = Math.min((areaWidth - FRAME_PADDING) / natural.width, MAX_FIT_SCALE);
  const wanted = natural.height * widthScale + FRAME_PADDING + OVERLAY_RESERVE;
  const height = Math.round(Math.min(Math.max(wanted, MIN_FRAME_PX), Math.max(MIN_FRAME_PX, viewportHeight * 0.78)));
  const scale = Math.min(widthScale, (height - FRAME_PADDING - OVERLAY_RESERVE) / natural.height);
  return { height, scale };
};
