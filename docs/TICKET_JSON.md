# Convención `ticket.json`

Cada carpeta de ticket en `_EXTRA` (ruta configurable en el panel) puede tener un `ticket.json` en su raíz. Es la fuente de las vistas **Pruebas** y **Planificación** del Dev Panel. La skill [`skills/dev-panel`](../skills/dev-panel/SKILL.md) es la versión para Claude de esta misma convención (si cambia una, cambiá la otra). Lo escriben las skills del pipeline (`ing-requisitos-sdd`, `arquitecto-sdd`, `desarrollador-sdd`, `gitlab-review`, `ship`) al cerrar cada etapa. El panel solo lo lee; si falta, igual lista la carpeta y deduce lo básico del nombre (`33526-pendientes-firma`).

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
  "tipo": "desarrollo | revision",
  "rama": "feature/33526-pendientes-firma",
  "repos": ["front", "legajo", "documentos"],
  "mrs": [{ "fecha": "2026-10-27", "repo": "front", "iid": 123, "url": "https://git.icono-cloud.com/...", "autor": "usuario", "estado": "abierto" }],
  "codeReview": [{ "fecha": "2026-10-27", "veredicto": "aprobado | con cambios | rechazado", "resumen": "una línea", "hallazgos": 2 }],
  "pruebas": [{ "fecha": "2026-10-27", "conclusion": "aprobado | requiere-cambios | sin-conclusion", "resultado": "31/31", "resumen": "qué se probó", "archivo": "33526_EJECUCION_v1.0.md", "capturas": ["pruebas/capturas/b1.png"] }],
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

## Campos que usa el historial y el checklist de pruebas
- `mrs[].fecha` y `codeReview[].fecha` / `pruebas[].fecha` (`AAAA-MM-DD`) alimentan el **historial de 5 días** del Daily. Sin fecha el evento no aparece.
- `pruebas[].conclusion` es el estado de esa tanda según la skill. El panel lo muestra, y lo que se marque en el panel (aprobado / requiere cambios / sin conclusión) tiene prioridad. Cada tanda tiene su propio checklist ("actualizar ticket", "subir comentarios"), que vive en el panel, no en este archivo.

## Reglas para que los diagramas Mermaid dibujen
Los diagramas de los `.md` y `.mmd` se dibujan en el panel con Mermaid, que es estricto. Tres errores reales que ya aparecieron en `_EXTRA`:
1. **Comillas dentro de una etiqueta de flowchart:** `Z[Menú sin "Algo"]` falla. Usar `Z["Menú sin #quot;Algo#quot;"]` o comillas simples.
2. **Punto y coma en un mensaje de secuencia:** `A->>B: recalcula; sigue` falla (el `;` corta la instrucción). Usar coma, "y" o `#59;`.
3. **Dos veces `:` en una transición de estados:** `A --> B: texto (rol: admin)` falla. Dejar un solo `:` por línea.
Etiquetas que ya empiezan con comillas (`A["Texto (con paréntesis)"]`) son válidas.

## Tipo de ticket: `tipo`
- `desarrollo` (por defecto): lo desarrollo yo; aparece en **Desarrollo** y en Pruebas.
- `revision`: solo reviso el desarrollo de otra persona; **nunca** aparece en Desarrollo, solo en Pruebas, y el resumen semanal lo agrupa como revisión.
- Lo marcado en el panel (Pruebas → "Tipo de ticket") tiene prioridad sobre este campo. "Listo para pruebas" también se marca en el panel y no vive en este archivo.

## Servicios del ticket: `servicios` (opcional)
Servicios de compose que hay que **tener levantados para probar el ticket aunque no se modifiquen** (por ejemplo `firma`, que el ticket solo usa para firmar). El botón **Levantar servicios** levanta la **suma** de los de `repos` (`control-horario` → `controlhorario`, `file-manager` → `files`; el front no es un servicio) y los de este campo. Los obligatorios (`panel`, `security`, `files`, `legajo`) y MinIO/RabbitMQ/Mongo siempre se levantan: se pueden listar para documentar, no hace falta. Nombres del compose, no de repos.

## Pruebas manuales: `pruebasManuales` (opcional)
Lista de casos para probar a mano, que el panel muestra como checklist en la pestaña **Pruebas manuales** de Pruebas. Cada elemento es un texto o `{ "caso": "...", "esperado": "...", "grupo": "...", "ruta": "/profile?panel=...", "url": "https://..." }` (todo menos `caso` es opcional; los casos del mismo `grupo` se muestran juntos). `ruta` es un path del front que empieza con `/` y el panel lo abre contra `session.frontUrl` de la configuración (por defecto `http://localhost:4200`), con un botón **Abrir** al lado del caso; `url` es un enlace completo (solo http o https) y manda sobre `ruta`. Cualquier otro valor se ignora. Qué se tildó **no** vive en este archivo: lo guarda el panel, y el usuario puede sumar casos propios desde la pantalla. Conviene derivarlos de los criterios de aceptación del contrato, en pasos que alguien pueda seguir sin leer el código.
