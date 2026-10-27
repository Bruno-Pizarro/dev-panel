import type { CSSProperties } from 'react';

// Canales RGB (no "#hex") para poder usar opacidad. Elegidos para verse bien sobre el fondo oscuro del panel.
const PALETTE = [
  '99 179 237', '129 140 248', '167 139 250', '232 121 249', '244 114 182', '251 113 133',
  '251 146 60', '250 204 21', '163 230 53', '74 222 128', '45 212 191', '34 211 238',
];

const hash = (text: string): number => {
  let value = 5381;
  for (let i = 0; i < text.length; i += 1) value = ((value << 5) + value + text.charCodeAt(i)) >>> 0;
  return value;
};

/** Color estable de un servicio: el mismo nombre da siempre el mismo color en todas las vistas. */
export const serviceColor = (name: string): string => PALETTE[hash(name) % PALETTE.length]!;

export const tint = (rgb: string, alpha: number): string => `rgb(${rgb} / ${alpha})`;

/** Estilo de una "píldora" de servicio: borde, fondo y texto del mismo color. */
export const pillStyle = (rgb: string, strong = false): CSSProperties => ({
  color: `rgb(${rgb})`,
  backgroundColor: tint(rgb, strong ? 0.18 : 0.1),
  borderColor: tint(rgb, strong ? 0.55 : 0.3),
});
