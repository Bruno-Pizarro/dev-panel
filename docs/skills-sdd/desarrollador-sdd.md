## Registro en el Dev Panel (`ticket.json`)

Al cerrar tu etapa, dejá registrado el avance en `ticket.json` dentro de la carpeta del ticket (`_EXTRA/<ticket>-<slug>/`; en este equipo `/root/projects/_EXTRA`). El Dev Panel (`/root/projects/dev-panel`) lo lee para sus vistas de Pruebas y Planificación. Convención completa: `/root/projects/dev-panel/docs/TICKET_JSON.md`.

Reglas: **leer antes de escribir y mezclar** (conservar los campos de otras etapas, nunca recrear el archivo); JSON válido; fechas `AAAA-MM-DD`; rutas relativas a la carpeta; **sin credenciales**; omitir lo que no se sabe.

Esta skill escribe: `estado` ("En desarrollo") y una entrada nueva en `pruebas[]` por cada tanda de pruebas: `fecha`, `resultado` (por ejemplo `31/31`), `resumen` (qué se probó, en una o dos líneas), `conclusion` (`aprobado`, `requiere-cambios` o `sin-conclusion`), `archivo` (el informe de ejecución) y `capturas` (rutas relativas de las capturas guardadas en la carpeta).
