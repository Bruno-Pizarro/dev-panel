import { describe, expect, it } from 'vitest';
import { FRAME_PADDING, MIN_FRAME_PX, OVERLAY_RESERVE, fitFrame } from './mermaidFrame';

describe('fitFrame', () => {
  it('un diagrama ancho en un marco angosto se achica a lo ancho y el marco no queda altísimo', () => {
    const { scale, height } = fitFrame({ width: 1124, height: 539 }, 334, 900);
    expect(scale).toBeCloseTo((334 - FRAME_PADDING) / 1124, 5);
    expect(height).toBe(MIN_FRAME_PX);
  });

  it('un diagrama que entra con holgura no se agranda más de 1,6 veces y el marco se ajusta a su alto', () => {
    const { scale, height } = fitFrame({ width: 200, height: 100 }, 1000, 900);
    expect(scale).toBe(1.6);
    expect(height).toBe(MIN_FRAME_PX);
  });

  it('un diagrama alto no pasa del 78 % de la ventana y se achica para entrar completo', () => {
    const { scale, height } = fitFrame({ width: 400, height: 2000 }, 800, 1000);
    expect(height).toBe(780);
    expect(scale).toBeCloseTo((780 - FRAME_PADDING - OVERLAY_RESERVE) / 2000, 5);
    expect(2000 * scale + FRAME_PADDING + OVERLAY_RESERVE).toBeLessThanOrEqual(height);
  });

  it('deja lugar abajo para la ayuda y la barra: el diagrama más la reserva nunca pasa del marco', () => {
    const { scale, height } = fitFrame({ width: 400, height: 900 }, 800, 800);
    expect(900 * scale + FRAME_PADDING + OVERLAY_RESERVE).toBeLessThanOrEqual(height + 0.001);
  });

  it('en una ventana muy baja respeta el alto mínimo', () => {
    expect(fitFrame({ width: 400, height: 2000 }, 800, 300).height).toBe(MIN_FRAME_PX);
  });

  it('el marco crece con el diagrama cuando hay lugar', () => {
    const { height } = fitFrame({ width: 600, height: 500 }, 700, 1200);
    expect(height).toBe(Math.round(500 * ((700 - FRAME_PADDING) / 600) + FRAME_PADDING + OVERLAY_RESERVE));
  });
});
