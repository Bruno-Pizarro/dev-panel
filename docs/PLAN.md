# Dev Panel — plan de construcción

> **Estado (27/10/2026): Fases 0 a 5 implementadas.** Este documento queda como registro del diseño; el estado vigente y las vistas están en [CLAUDE.md](../CLAUDE.md). Diferencias respecto del plan original: los nombres de servicio de MinIO son `minio` y `mc`; los perfiles de `.env` usan matchers `CLAVE`, `CLAVE=valor` y `CLAVE!=valor` para distinguir bloques repetidos; "entrar como usuario" siembra el navegador con un script para la consola (el panel no puede escribir el `localStorage` de otro origen); RabbitMQ quedó fuera por pedido.

Panel web local para el entorno de desarrollo de e-sueldos. Reemplaza los scripts sueltos (`backup_improved4.sh`, `reset_password_superadmin.sh`, secuencias de `docker compose` a mano) por una interfaz en modo oscuro pensada para desarrolladores. Parte del prototipo de `_EXTRA/dev-panel` (Node sin dependencias, ver su `PLAN_DEV_PANEL.md`), que se migra a este repo.

Fecha del plan: 27/10/2026.

## 1. Decisiones ya tomadas
| Tema | Decisión |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind 3.4 (versiones compatibles con Node 18.14 del entorno actual) |
| Backend | Node + TypeScript con Fastify 4; sirve la API y el frontend compilado; eventos en vivo por SSE |
| Docker | Se invoca la CLI (`docker`, `docker compose`) con `execFile`, sin shell. Un único compose general compartido (`/root/projects/docker-compose.yml`) más `file-manager/docker.compose.minio.yml` |
| Gestor de paquetes | **Yarn (1.22) siempre**: dependencias, scripts y documentación. Prohibido `npm`/`npx` en scripts, README y CLAUDE.md |
| Arranque | `yarn start` (compila si hace falta y sirve en `127.0.0.1`) |
| Documentación para agentes | `CLAUDE.md` en la raíz, para que cualquier agente entienda y configure el repo en cualquier máquina (§4) |
| Estética | Modo oscuro, pensado para programadores, prioridad permanente (ver §6) |
| Repo | `/root/projects/dev-panel` (este), con su propio git |
| Chat | Fuera de alcance: se usa la extensión de Claude en VS Code a pantalla completa |
| RabbitMQ | Fuera de alcance: ya existe su UI propia |
| Configuración | Todo configurable por `config.json` para poder compartir la herramienta (§3) |

## 2. Funcionalidades (alcance)
1. **Daily:** muestra el MD del día (historial de 5 archivos rotativos); se genera un borrador desde git y se edita en el panel.
2. **Levantado en orden:** chips de servicios opcionales y ejecución por etapas con estado en vivo.
3. **Pruebas:** lista de carpetas de `_EXTRA` con MD, capturas, ticket, MRs y veredictos de code-review.
4. **Planificación y análisis:** ticket, rama propuesta, plan abreviado, diagrama de flujo y captura de referencia.
5. **Editor rápido de `.env`:** perfiles por repo (MinIO local / remoto) con diff y respaldo.
6. **Configurable:** ruta de `_EXTRA`, de los repos, nombres de contenedores y orden de servicios.
7. **Backups con chips:** bases y colecciones reales del Mongo local como chips seleccionables.
8. **Extras elegidos:** entrar como usuario X, estado de ramas por repo, chequeo de entorno, datos de prueba por ticket, y a futuro un servidor MCP.
9. **Ya hecho en el prototipo, a migrar:** estado de servicios con logs y reinicio, reseteo de contraseña por mail en todas las bases, snapshots de datos con verificación de conteo, envoltorio del backup remoto.

## 3. Configuración (`config.json`)
Se crea en el primer arranque con un asistente y vive fuera de git (`config.example.json` sí se versiona).
```json
{
  "paths": {
    "projects": "/root/projects",
    "extra": "/root/projects/_EXTRA",
    "daily": "/root/projects/_EXTRA/daily"
  },
  "compose": {
    "main": "/root/projects/docker-compose.yml",
    "minio": "/root/projects/file-manager/docker.compose.minio.yml"
  },
  "mongo": { "container": "mongo-db" },
  "startup": {
    "stage1": ["minio", "minio-mc"],
    "stage2": ["rabbitmq", "mongo-e-sueldos"],
    "rabbitReady": { "container": "rabbitmq", "logMatch": "completed with 3 plugins", "timeoutSec": 180 },
    "mandatory": ["new-panel", "security", "files", "legajo"],
    "optional": ["leia", "firma", "controlhorario", "documentos", "cursos", "recibos", "incidencia", "notificaciones", "proyectos", "liquidacion", "recruiting", "salud-laboral", "help-center", "reconocimientoapi"],
    "groups": { "leia": { "withStage2": ["leia-qdrant", "leia-redis"] } }
  },
  "repos": ["documentos", "file-manager", "firma", "legajo", "front", "security"]
}
```
Notas: los nombres de `stage1`, `stage2`, `mandatory` y `optional` son nombres de **servicio de compose** (`mongo-e-sueldos`, `new-panel`), no de contenedor (`mongo-db`, `panel`); el panel muestra el contenedor. `mongo-restore` queda excluido a propósito.

## 4. Estructura del repo
```
dev-panel/
  package.json            # workspaces de yarn: server, web
  CLAUDE.md               # guía para agentes: qué es, cómo se instala, cómo se prueba, reglas
  yarn.lock
  config.example.json
  server/                 # Fastify + TS
    src/{index.ts, config.ts, docker.ts, sse.ts, routes/*, services/*}
  web/                    # React + Vite + Tailwind
    src/{app, components, views, lib}
  docs/                   # este plan, convenciones, ticket.json de ejemplo
  data/                   # snapshots, backups de .env (ignorado en git)
```
- `server/services`: `startup`, `containers`, `mongo`, `snapshots`, `envProfiles`, `tickets`, `daily`, `repos`, `session`.
- `web/views`: Servicios, Levantado, Pruebas, Planificación, Daily, Datos, Entorno, Configuración.

## 5. Convención `ticket.json` (clave de las vistas 3 y 4)
Un archivo por carpeta de `_EXTRA/<ticket>-<slug>/`, que escribe Claude al cerrar cada etapa. El panel solo lo lee; si falta, igual lista la carpeta y deduce lo básico.
```json
{
  "ticket": "33526", "titulo": "Pestaña Pendientes de firma en el Perfil",
  "url": "https://redmine.../issues/33526",
  "estado": "En revisión", "responsable": "…",
  "rama": "feature/33526-pendientes-firma",
  "repos": ["front", "legajo", "documentos"],
  "mrs": [{ "repo": "front", "iid": 0, "url": "", "autor": "", "estado": "abierto" }],
  "codeReview": [{ "fecha": "2026-10-27", "veredicto": "aprobado|con-cambios", "resumen": "", "hallazgos": 0 }],
  "pruebas": [{ "fecha": "2026-10-27", "resumen": "", "resultado": "31/31", "archivo": "33526_EJECUCION_v1.0.md", "capturas": ["pruebas/capturas/b1.png"] }],
  "plan": { "resumen": "plan_abreviado.md", "diagrama": "flujo.mmd", "referenciaVisual": "referencia.png" }
}
```
Sin credenciales en estos archivos. Credenciales de prueba siguen fuera de `_EXTRA`.

## 6. Dirección de diseño
- **Tema:** oscuro "medio", no negro puro: fondo `#0f1419`, superficies `#161b22`/`#1c2330`, bordes `#2a3342`; texto `#e6edf3` y `#8b98a9`.
- **Acentos:** azul/índigo para acciones, verde, ámbar y rojo para estados; un único acento fuerte por pantalla.
- **Tipografía:** Inter para la interfaz y JetBrains Mono para logs, rutas, comandos y diffs. Nunca texto menor a 14 px (regla del proyecto).
- **Densidad:** cómoda, bordes suaves de 8–12 px, sin sombras pesadas, espaciado generoso.
- **Patrones:** barra lateral con iconos; paleta de comandos `Ctrl+K`; chips para toda selección múltiple; terminal de logs con colores; toasts; esqueletos de carga; atajos de teclado.
- **Contenido:** Markdown con resaltado de sintaxis, tablas legibles, Mermaid con tema oscuro, galería de capturas con zoom y navegación por teclado.
- **Accesibilidad:** contraste AA, foco visible, `prefers-reduced-motion`.
- Se prepara el toggle claro/oscuro, pero solo se diseña el oscuro.

## 7. Seguridad (herencia del prototipo, se mantiene)
Solo `127.0.0.1`; validación de `Host`; cabecera `X-Dev-Panel: 1` en toda escritura; listas blancas de bases, colecciones, contenedores y servicios; nada de shell (`execFile`); prohibido tocar `admin`, `config`, `local`; confirmación en la UI **y** en el servidor para lo destructivo; los `.env` nunca muestran valores sensibles (enmascarados) ni se envían a logs; sin credenciales en el repo (SFTP del backup remoto pasa a `.env` propio, ignorado en git).

## 8. Fases

### Fase 0 — Base (0,5 día)
- T0.1 Repo, workspaces, TypeScript estricto, ESLint/Prettier, `.gitignore` (data, config.json, .env).
- T0.2 Servidor Fastify con validación de Host, header anti-CSRF, SSE y carga de `config.json` con esquema (zod).
- T0.3 Frontend: layout (sidebar, cabecera, paleta de comandos), tema oscuro, componentes base (Chip, Card, Button, LogView, StatusDot, Toast, Markdown, Modal).
- T0.4 Asistente de primer arranque: detecta `docker`, `docker compose`, rutas y contenedores; escribe `config.json`.
- T0.5 `CLAUDE.md`: propósito, comandos (`yarn install`, `yarn dev`, `yarn start`, `yarn build`, `yarn lint`, `yarn test`), estructura, convenciones (código en inglés, textos de UI en español, tamaño de fuente mínimo 14 px, solo yarn), reglas de seguridad, cómo configurar `config.json` en una máquina nueva y qué NO tocar (compose compartido, `.env` de los repos sin pasar por el editor).
- **Listo cuando:** `yarn install && yarn start` abre el panel vacío con tema, y el asistente genera la configuración.

### Fase 1 — Servicios y levantado en orden (1–1,5 días) **[prioridad]**
- T1.1 Vista Servicios: contenedores con estado, puertos, `tsc` (leído desde el último arranque con `--since`), logs en vivo (SSE), reinicio con confirmación. Migra el prototipo.
- T1.2 Motor de levantado por etapas, con `docker compose up -d --no-deps <servicios>` para controlar el orden real:
  1. **Etapa 1:** `minio`, `minio-mc` (compose de file-manager).
  2. **Etapa 2:** `rabbitmq` y `mongo-e-sueldos`, más `leia-qdrant` y `leia-redis` si Leia está seleccionado.
  3. **Espera:** log de RabbitMQ con `completed with 3 plugins` **posterior al inicio de esta ejecución** (`docker logs --since`), más Mongo saludable. Timeout y mensaje claro.
  4. **Etapa 3:** obligatorios `new-panel`, `security`, `files`, `legajo` + los chips elegidos, sin importar el orden entre sí.
- T1.3 Vista Levantado: chips de opcionales (con "seleccionar todo", presets guardados por usuario), botón "Levantar", línea de tiempo por etapa con ⏳/✅/❌, logs por servicio, "Reintentar etapa" y "Detener todo" con confirmación.
- T1.4 Idempotencia: si un contenedor ya está arriba y sano, se marca "ya levantado" y se continúa.
- **Listo cuando:** con todo caído se levanta el stack elegido en el orden pedido sin intervención; con RabbitMQ lento o caído el panel informa y no sigue a la etapa 3.

### Fase 2 — Pruebas y planificación (1,5–2 días)
- T2.1 Escáner de `paths.extra`: lista carpetas, lee `ticket.json` (o deduce desde el nombre y los MD) y ordena por última modificación.
- T2.2 Vista Pruebas: lista lateral por ticket; detalle con resumen (ticket, rama, MRs con dueño, veredicto de code-review, resultado de las pruebas), MD de informes renderizados y galería de capturas con zoom.
- T2.3 Vista Planificación: ticket, rama propuesta, plan abreviado, diagrama Mermaid y captura de referencia; accesos a contrato, análisis y plan completos.
- T2.4 Documentar `ticket.json` y que Claude lo genere/actualice al cerrar análisis, pruebas y code-review (ajuste de las skills o de las instrucciones de trabajo, a acordar).
- T2.5 Búsqueda por ticket, texto y fecha.
- **Listo cuando:** abrir `33526` muestra su análisis, sus pruebas con capturas y sus MRs sin tocar archivos a mano.

### Fase 3 — Daily, entorno y datos (1,5 días)
- T3.1 **Daily:** carpeta configurable; visor/editor del MD del día; botón "Generar borrador" que junta commits y `git diff --stat` por repo desde el último daily, tickets tocados (por `ticket.json`) y pruebas realizadas; un archivo por día (`AAAA-MM-DD.md`) en la carpeta configurada; se conservan **5 archivos**: al crear uno nuevo con 5 existentes se borra el más viejo. El panel muestra el de hoy y permite navegar el historial.
- T3.2 **Editor de `.env` (MinIO local ⇄ remoto):** el cambio es **comentar o descomentar** un bloque de líneas, sin tocar los valores:
  - *Local (MinIO):* `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`, `AWS_ENDPOINT`, `AWS_S3_PUBLIC_URL`, `AWS_S3_FORCE_PATH_STYLE` y `USE_MINIO=true` quedan **activas**, y el `USE_MINIO=false` de "deshabilitar en prod" queda **comentado**.
  - *Remoto:* el bloque MinIO queda comentado y `USE_MINIO=false` activo.
  - El perfil de cada repo (`documentos`, `file-manager`, `firma`) lista las claves del bloque en `config.json`; el panel detecta el estado actual leyendo qué líneas están comentadas, muestra el diff (valores sensibles enmascarados), respalda el `.env` en `data/` y aplica **solo** el cambio del prefijo `# ` en esas líneas.
  - Los `.env` de hoy no son idénticos (en `documentos` hay dos bloques `AWS_*`; en `file-manager` hay líneas comentadas repetidas), así que el editor opera sobre el bloque marcado por el perfil y, si encuentra una clave repetida o ambigua, no aplica e informa.
  - **Perfiles por repo (según los `.env` que pasó el usuario, sin valores sensibles):**

    | Repo | Estado "MinIO local" | Estado "Remoto" | Línea especial |
    |---|---|---|---|
    | `file-manager` | las 8 claves `AWS_*`/`USE_MINIO=true` activas | las 8 comentadas | además alterna `USE_MINIO=false` (activo en remoto, comentado en local) |
    | `firma` | las 8 claves activas | las 8 comentadas | no tiene línea `USE_MINIO=false` |
    | `documentos` | **pendiente de confirmar** (ver abajo) | las 8 claves comentadas (las credenciales las inyecta el compose) | no tiene línea `USE_MINIO=false` |

    Las 8 claves son: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`, `AWS_ENDPOINT`, `AWS_S3_PUBLIC_URL`, `AWS_S3_FORCE_PATH_STYLE` y `USE_MINIO`.
  - **Caso ambiguo en `documentos`:** un `.env` suyo tiene a la vez un bloque remoto activo (con `USE_MINIO=false`) y un bloque MinIO activo debajo, es decir claves duplicadas; qué valor gana depende de cómo se lea el archivo. El editor no resuelve duplicados por su cuenta: en ese caso muestra el conflicto y propone comentar el bloque que no corresponde al perfil elegido. Hay que confirmar con el usuario que ese es el comportamiento deseado.
  - Los valores de credenciales **nunca** se copian al repo ni a los logs; el perfil solo guarda nombres de clave y estado (comentada/activa).
  - Después de aplicar ofrece reiniciar el contenedor del repo para que tome el cambio.
- T3.3 **Backups con chips:** árbol base → colección con conteos y buscador; snapshot y restauración con verificación de conteo (migra el prototipo); backup remoto envolviendo `backup_improved4.sh`, con la clave del SFTP movida a `.env` propio.
- T3.4 Contraseña por mail en **todas** las bases con `users` (migra el prototipo).
- **Listo cuando:** el daily se genera con un clic, el `.env` de firma/documentos/file-manager se cambia entre perfiles con respaldo, y un snapshot se elige sin escribir nombres.

### Fase 4 — Extras elegidos (1–1,5 días)
- T4.1 **Entrar como usuario X:** abre el navegador con sesión sembrada (refresh token) y la limpia al cerrar; lista de usuarios de prueba definida en `config.json`, sin contraseñas en el repo.
- T4.2 **Ramas por repo:** rama actual, cambios sin commitear, adelanto/atraso contra `desarrollo`; solo lectura.
- T4.3 **Chequeo de entorno:** `INTERNAL_SERVICE_SECRET` faltante, puertos ocupados, `tsc` trabado, **CA de `firma` ausente o vencido**, `.env` con variables faltantes respecto de `.env.example`.
- T4.4 **Datos de prueba por ticket:** lista lo sembrado con prefijo `[ticket]`, y limpia con confirmación verificando contra el backup.
- **Listo cuando:** cada chequeo reproduce un caso real de los que ya nos pasaron.

### Fase 5 — Pulido y MCP (a definir)
- Servidor MCP con las mismas operaciones (levantar stack, restaurar colección, etc.) para que Claude las use.
- Empaquetado para compañeros: README, `config.example.json`, script de verificación.
- Revisión de accesibilidad, atajos y rendimiento.

## 9. Estimación (con Claude generando el código)
| Fase | Esfuerzo |
|---|---|
| 0 Base | 0,5 día |
| 1 Servicios + levantado | 1–1,5 días |
| 2 Pruebas + planificación | 1,5–2 días |
| 3 Daily + entorno + datos | 1,5 días |
| 4 Extras | 1–1,5 días |
| **Total hasta Fase 4** | **~6–7 días** (se puede usar tras la Fase 1) |

## 10. Riesgos y puntos abiertos
1. **Detección de RabbitMQ listo:** depende del texto del log; se deja configurable (`logMatch`) y se combina con un chequeo de puerto/estado como respaldo.
2. **Compose compartido:** el panel nunca modifica el `docker-compose.yml`; solo lo invoca. Los nombres de servicio y de contenedor pueden diferir (`mongo-e-sueldos` / `mongo-db`).
3. **MinIO en otro compose** (`file-manager/docker.compose.minio.yml`, con la etiqueta de proyecto apuntando a una ruta de Windows): hay que invocarlo explícitamente con `-f` y validar que no cree un proyecto duplicado.
4. **Node 18.14:** limita Vite a 5.x y Tailwind a 3.x; si se actualiza Node, se puede subir.
5. **Archivos grandes de capturas:** miniaturas bajo demanda y carga diferida.
6. **`ticket.json` lo escribe Claude:** requiere acordar cuándo y con qué skill; sin él, la vista funciona degradada.
7. **Backup remoto sin probar:** queda detrás de "Simular" hasta validarlo a mano.
8. **Compartir con compañeros:** rutas distintas por usuario; por eso todo sale de `config.json`.

## 11. Decisiones cerradas (27/10/2026)
1. **Daily:** un archivo por día, 5 de historial rotativo (se borra el más viejo al crear el sexto).
2. **Presets de levantado:** compartidos en `config.json` (de fábrica: solo obligatorios y "Leia") **más** personales en `data/`.
3. **`.env`:** perfil "MinIO local / remoto" por comentar-descomentar (ver T3.2). Las diferencias exactas entre los 3 repos las pasa el usuario después; el esquema ya las soporta.
4. **`ticket.json`:** se ajustan las skills (`ing-requisitos-sdd`, `arquitecto-sdd`, `desarrollador-sdd`, `gitlab-review` y `ship`) para escribirlo y actualizarlo al cerrar cada etapa.
5. **Yarn** para todo y `CLAUDE.md` obligatorio en la raíz.

## 12. Pendiente
- Confirmar el diff exacto de `.env` por repo cuando lo pase el usuario (T3.2).
- Definir el texto de los cambios a las skills antes de la Fase 2 (T2.4).

## 13. Backlog anotado (27/10/2026)

### Kanban propio sobre la API de Redmine (pedido del usuario)
Tablero de cards por columna de estado para ver de un vistazo cómo está el trabajo, con datos en vivo de Redmine (solo lectura al inicio).
- **Fuente:** `GET /issues.json` con la API key de la skill `redmine-drive` (ya la lee `server/src/services/redmine.ts`; nunca se copia ni se muestra). Filtros por proyecto, asignado, sprint (versión) y tracker.
- **Columnas:** los estados reales del flujo del equipo, en este orden: Análisis · Req. Definido · Estimación · Desarrollo · Commit · Revisión · Testeado · Testing Consultoría · Testing Aprobado Consultoría · Terminado · Entregado (más Ampliación, Rechazado y Baja en un grupo aparte). Orden y visibilidad configurables.
- **Card:** número y título limpio, módulo, **SP** (se leen del prefijo `[5 SP]` del título), horas estimadas y gastadas con barra, asignado, **última actualización** ("hace 2 días", en rojo si pasa de un umbral), prioridad, tracker, vínculo a Redmine y, si existe la carpeta en la base de conocimiento, atajos a sus Pruebas y su Planificación.
- **Totales por columna:** cantidad de cards, suma de SP y de horas.
- **Interacción:** buscador, filtro por asignado/sprint, orden dentro de la columna (última actualización, SP, prioridad), vista compacta. Sin arrastrar para cambiar de estado en la primera versión (mover cards escribiría en Redmine: se evaluará aparte, con confirmación).
- **Rendimiento:** una consulta paginada por tablero con caché corta (60 s) y botón de actualizar; ya se usa el mismo caché que el detalle del ticket.
- **Fuera de alcance inicial:** crear o editar tickets, comentar.

### Cuentas y uso de Claude
Investigación en curso: ver `docs/INVESTIGACION_CUENTAS_CLAUDE.md`.
