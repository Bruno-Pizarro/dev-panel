## Registro en el Dev Panel (`ticket.json`)

Al cerrar tu etapa, dejá registrado el avance en `ticket.json` dentro de la carpeta del ticket (`_EXTRA/<ticket>-<slug>/`; en este equipo `/root/projects/_EXTRA`). El Dev Panel (`/root/projects/dev-panel`) lo lee para sus vistas de Pruebas y Planificación. Convención completa: `/root/projects/dev-panel/docs/TICKET_JSON.md`.

Reglas: **leer antes de escribir y mezclar** (conservar los campos de otras etapas, nunca recrear el archivo); JSON válido; fechas `AAAA-MM-DD`; rutas relativas a la carpeta; **sin credenciales**; omitir lo que no se sabe.

Los diagramas Mermaid deben dibujar en el Dev Panel: sin comillas dobles dentro de etiquetas sin comillas (`Z[Menú "x"]` falla; usar `#quot;`), sin `;` en mensajes de `sequenceDiagram` y con un solo `:` por transición en `stateDiagram`. Detalle: `/root/projects/dev-panel/docs/TICKET_JSON.md`.

Esta skill escribe: `tipo: "desarrollo"` (es un desarrollo propio), `rama`, `repos`, `plan.resumen` (generá un `plan_abreviado.md` de una página: objetivo, alcance, tareas clave, riesgos), `plan.diagrama` (archivo `flujo.mmd` en Mermaid con el flujo básico de la funcionalidad, no del código) y, **solo si el desarrollador lo pide**, `plan.referenciaVisual` (captura o mockup guardado en la carpeta que muestre cómo debería verse).
