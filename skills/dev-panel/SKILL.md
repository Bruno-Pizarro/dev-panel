---
name: dev-panel
description: Convención de ticket.json para el Dev Panel. Úsala cuando una etapa del pipeline de desarrollo (requisitos, arquitecto, desarrollador, code review, ship) termina y hay que dejar registrado el avance del ticket, cuando se pida crear o actualizar el ticket.json de una carpeta de ticket (base de conocimiento _EXTRA), o para armar las pruebas manuales, los servicios que hay que levantar o el diagrama de flujo de un ticket. El Dev Panel lee ese archivo para sus vistas de Pruebas y Desarrollo.
---

# Registro del avance en el Dev Panel (`ticket.json`)

El Dev Panel (panel web local del repo `dev-panel`) muestra el avance de cada ticket a partir de un archivo `ticket.json` en la carpeta del ticket de la **base de conocimiento** (por defecto `<proyectos>/_EXTRA/<ticket>-<slug>/`; la ruta real está en `paths.extra` del `config.json` del panel). Esta skill es la fuente única de esa convención: las skills del pipeline la siguen al cerrar su etapa.

## Cuándo y cómo
- Al **cerrar tu etapa**, no antes. Si no encontrás la carpeta del ticket, preguntá antes de crear una.
- **Leer antes de escribir y mezclar**: agregá o actualizá solo *tus* campos y conservá los de las demás etapas. Nunca recrees el archivo desde cero.
- JSON válido, UTF-8, fechas `AAAA-MM-DD` (verificá la fecha real del sistema), rutas **relativas a la carpeta del ticket**.
- **Sin credenciales** (tokens, claves, PINs, contraseñas) ni en `ticket.json` ni en los MD que muestra el panel.
- Todo es opcional: lo que no sepas, se omite; no se inventa.
- El panel solo sirve `.md`, `.mmd`, imágenes y `ticket.json`: guardá ahí los diagramas y capturas que deban verse.
- Al terminar, decile al usuario qué campos escribiste.

## Esquema
```json
{
  "ticket": "33526",
  "titulo": "Pestaña Pendientes de firma en el Perfil",
  "url": "https://redmine.../issues/33526",
  "estado": "En desarrollo",
  "responsable": "Nombre",
  "tipo": "desarrollo | revision",
  "rama": "feature/33526-pendientes-firma",
  "repos": ["front", "legajo", "documentos"],
  "servicios": ["firma"],
  "pruebasManuales": [{ "grupo": "Listado", "caso": "Buscar un documento por nombre", "esperado": "Filtra sin recargar" }],
  "mrs": [{ "fecha": "2026-10-27", "repo": "front", "iid": 123, "url": "https://git.../merge_requests/123", "autor": "usuario", "estado": "abierto" }],
  "codeReview": [{ "fecha": "2026-10-27", "veredicto": "aprobado | con cambios | rechazado", "resumen": "una línea", "hallazgos": 2 }],
  "pruebas": [{ "fecha": "2026-10-27", "conclusion": "aprobado | requiere-cambios | sin-conclusion", "resultado": "31/31", "resumen": "qué se probó", "archivo": "33526_EJECUCION_v1.0.md", "capturas": ["pruebas/capturas/b1.png"] }],
  "plan": { "resumen": "plan_abreviado.md", "diagrama": "flujo.mmd", "referenciaVisual": "referencia.png" }
}
```

## Qué escribe cada etapa
| Etapa (skill) | Campos |
|---|---|
| Requisitos (`ing-requisitos-sdd`) | `ticket`, `titulo`, `url`, `repos`, `rama` (propuesta); opcional, un `flujo.mmd` si el flujo no es trivial |
| Arquitecto (`arquitecto-sdd`) | `tipo: "desarrollo"`, `rama`, `repos`, `servicios`, `pruebasManuales` (derivadas de los criterios de aceptación), `plan.resumen` (`plan_abreviado.md` de una página: objetivo, alcance, tareas clave, riesgos), `plan.diagrama` (`flujo.mmd` con el flujo de la funcionalidad, no del código) y, solo si el usuario lo pide, `plan.referenciaVisual` |
| Desarrollador (`desarrollador-sdd`) | `estado` ("En desarrollo"), una entrada nueva en `pruebas[]` por cada tanda (`fecha`, `resultado` tipo `31/31`, `resumen`, `conclusion`, `archivo`, `capturas`); ajusta `pruebasManuales` y `servicios` si lo probado difiere |
| Code review (`gitlab-review`) | `tipo: "revision"` cuando el ticket lo desarrolló otra persona y solo se revisa; una entrada nueva en `codeReview[]` por revisión; `mrs[].estado` |
| Ship (`ship`) | una entrada en `mrs[]` por MR creado (`fecha`, `repo`, `iid`, `url`, `autor`, `estado: "abierto"`) y `estado` ("En revisión") |

`pruebas[].fecha`, `codeReview[].fecha` y `mrs[].fecha` alimentan el historial de 5 días del Daily: sin fecha el evento no aparece. `pruebas[].conclusion` es lo que dice la skill; lo que se marque en el panel tiene prioridad. Los checklists de cada tanda y "Listo para pruebas" viven en el panel, no acá.

## `tipo`
`desarrollo` (por defecto): lo desarrolla el usuario; aparece en Desarrollo y Pruebas. `revision`: solo revisa el desarrollo de otra persona; nunca aparece en Desarrollo.

## `servicios`: lo que hay que tener levantado para probar
Servicios del docker-compose que el ticket necesita **aunque no los modifique** (por ejemplo `firma`, si solo se usa para firmar). El botón "Levantar servicios" del panel levanta los de `repos` **más** estos. Usá nombres del compose, no de repos. Los obligatorios (`panel`, `security`, `files`, `legajo`) y MinIO, RabbitMQ y Mongo siempre se levantan: no hace falta listarlos.

## `pruebasManuales`: casos para probar a mano
Cada elemento es un texto o `{ "caso", "esperado", "grupo" }` (los dos últimos opcionales; los del mismo `grupo` se muestran juntos). Escribilos como pasos que alguien siga sin leer el código, uno por comportamiento verificable, con el resultado esperado visible en pantalla. Cubrí: el camino feliz, cada validación o error relevante, permisos/roles y aislamiento entre usuarios o empresas, y el comportamiento en celular si hay interfaz. Salen de los criterios de aceptación (BDD) del contrato. Lo tildado lo guarda el panel y el usuario puede sumar casos propios allí; no lo escribas en `ticket.json`.

## Diagramas Mermaid (`.mmd` y bloques ```mermaid en los `.md`)
El panel los dibuja con Mermaid, que es estricto. Tres errores reales:
1. **Comillas dobles dentro de una etiqueta de flowchart sin comillas**: `Z[Menú "x"]` falla. Usar `Z["Menú #quot;x#quot;"]` o comillas simples.
2. **`;` en un mensaje de `sequenceDiagram`**: `A->>B: a; b` falla. Usar coma, "y" o `#59;`.
3. **Dos `:` en una transición de `stateDiagram`**: `A --> B: texto (rol: admin)` falla. Un solo `:` por línea.
Mantené el diagrama corto: el flujo básico para entender la funcionalidad, no el detalle de implementación.
