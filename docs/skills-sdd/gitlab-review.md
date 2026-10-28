## Registro en el Dev Panel (`ticket.json`)

Al cerrar tu etapa, dejá registrado el avance en `ticket.json` dentro de la carpeta del ticket (`_EXTRA/<ticket>-<slug>/`; en este equipo `/root/projects/_EXTRA`). El Dev Panel (`/root/projects/dev-panel`) lo lee para sus vistas de Pruebas y Planificación. Convención completa: `/root/projects/dev-panel/docs/TICKET_JSON.md`.

Reglas: **leer antes de escribir y mezclar** (conservar los campos de otras etapas, nunca recrear el archivo); JSON válido; fechas `AAAA-MM-DD`; rutas relativas a la carpeta; **sin credenciales**; omitir lo que no se sabe.

Esta skill escribe: `tipo: "revision"` cuando el ticket lo desarrolló otra persona y solo se revisa (nunca en Desarrollo), una entrada nueva en `codeReview[]` por cada revisión (`fecha`, `veredicto`: `aprobado`, `con cambios` o `rechazado`, `resumen` de una línea y `hallazgos` como cantidad) y actualiza `mrs[].estado` de los MRs revisados. Si la carpeta del ticket no existe, no la crees: informá que no se registró.
