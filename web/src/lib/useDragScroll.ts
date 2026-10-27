import { useCallback, useEffect, useState } from 'react';

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';
const THRESHOLD_PX = 5;

/**
 * Arrastrar con el mouse para moverse en horizontal. Un clic simple sigue funcionando: el arrastre empieza recién
 * después de mover unos píxeles y, si hubo arrastre, se cancela el clic que lo sigue (para no abrir un enlace por error).
 */
export const useDragScroll = <T extends HTMLElement>() => {
  // Callback ref: el contenedor puede montarse después de la primera carga (tras un spinner o un error).
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  useEffect(() => {
    if (!element) return;
    let start: { x: number; scroll: number } | null = null;
    let dragging = false;

    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as HTMLElement).closest(INTERACTIVE)) return;
      start = { x: event.clientX, scroll: element.scrollLeft };
      dragging = false;
    };
    const move = (event: PointerEvent) => {
      if (!start) return;
      const delta = event.clientX - start.x;
      if (!dragging && Math.abs(delta) < THRESHOLD_PX) return;
      dragging = true;
      element.style.cursor = 'grabbing';
      element.style.userSelect = 'none';
      element.scrollLeft = start.scroll - delta;
    };
    const up = () => {
      start = null;
      element.style.cursor = '';
      element.style.userSelect = '';
    };
    const swallowClick = (event: MouseEvent) => {
      if (dragging) (event.stopPropagation(), event.preventDefault());
      dragging = false;
    };

    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    element.addEventListener('click', swallowClick, true);
    return () => {
      up();
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      element.removeEventListener('click', swallowClick, true);
    };
  }, [element]);
  return ref;
};
