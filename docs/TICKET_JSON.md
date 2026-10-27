# Convención `ticket.json`

Cada carpeta de ticket en `_EXTRA` (ruta configurable en el panel) puede tener un `ticket.json` en su raíz. Es la fuente de las vistas **Pruebas** y **Planificación** del Dev Panel. Lo escriben las skills del pipeline (`ing-requisitos-sdd`, `arquitecto-sdd`, `desarrollador-sdd`, `gitlab-review`, `ship`) al cerrar cada etapa. El panel solo lo lee; si falta, igual lista la carpeta y deduce lo básico del nombre (`33526-pendientes-firma`).

## Reglas
1. **Leer antes de escribir y mezclar**: cada etapa agrega o actualiza *sus* campos y conserva los de las demás. Nunca recrear el archivo desde cero.
2. JSON válido, UTF-8, fechas `AAAA-MM-DD`, rutas **relativas a la carpeta del ticket**.
3. **Sin credenciales** (tokens, claves, PINs, contraseñas), ni en este archivo ni en los MD que muestra el panel.
4. Todos los campos son opcionales; un campo desconocido se omite, no se inventa.
5. El panel solo sirve `.md`, `.mmd`, imágenes y `ticket.json`: guardar ahí los diagramas (`*.mmd`) y capturas que deban verse.

## Esquema
```json
{
  "ticket": "33526",
  "titulo": "Pestaña Pendientes de firma en el Perfil",
  "url": "https://redmine.icono-cloud.com/issues/33526",
  "estado": "En desarrollo",
  "responsable": "Nombre",
  "rama": "feature/33526-pendientes-firma",
  "repos": ["front", "legajo", "documentos"],
  "mrs": [{ "repo": "front", "iid": 123, "url": "https://git.icono-cloud.com/...", "autor": "usuario", "estado": "abierto" }],
  "codeReview": [{ "fecha": "2026-10-27", "veredicto": "aprobado | con cambios | rechazado", "resumen": "una línea", "hallazgos": 2 }],
  "pruebas": [{ "fecha": "2026-10-27", "resultado": "31/31", "resumen": "qué se probó", "archivo": "33526_EJECUCION_v1.0.md", "capturas": ["pruebas/capturas/b1.png"] }],
  "plan": { "resumen": "plan_abreviado.md", "diagrama": "flujo.mmd", "referenciaVisual": "referencia.png" }
}
```

## Qué escribe cada skill
| Skill | Campos |
|---|---|
| `ing-requisitos-sdd` | `ticket`, `titulo`, `url`, `repos`, `rama` (propuesta) |
| `arquitecto-sdd` | `rama`, `repos`, `plan.resumen` (plan abreviado en MD), `plan.diagrama` (Mermaid `.mmd`), `plan.referenciaVisual` (solo si se pidió una captura de cómo debería verse) |
| `desarrollador-sdd` | `estado` ("En desarrollo"), `pruebas[]` (una entrada por tanda de pruebas, con `resultado` tipo `31/31`) |
| `gitlab-review` | `codeReview[]` (una entrada por revisión), `mrs[].estado` |
| `ship` | `mrs[]` (repo, iid, url, autor, estado "abierto"), `estado` ("En revisión") |

## Diagrama de flujo
Formato Mermaid en un archivo `.mmd` (por ejemplo `flowchart TD`). El panel lo dibuja con el tema oscuro. Mantenerlo corto: el flujo básico para entender la funcionalidad, no el detalle de implementación.
