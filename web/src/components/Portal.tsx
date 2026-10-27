import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderiza fuera del layout: los overlays a pantalla completa no pueden vivir dentro de un contenedor con
 * `transform` (la animación de entrada de la página), porque este se vuelve su bloque contenedor y los recorta.
 */
export const Portal = ({ children }: { children: ReactNode }) => createPortal(children, document.body);
