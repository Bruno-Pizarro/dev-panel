# Dev Panel — plan de construcción

Panel web local para el entorno de desarrollo de e-sueldos. Reemplaza los scripts sueltos (`backup_improved4.sh`, `reset_password_superadmin.sh`, secuencias de `docker compose` a mano) por una interfaz en modo oscuro pensada para desarrolladores. Parte del prototipo de `_EXTRA/dev-panel` (Node sin dependencias, ver su `PLAN_DEV_PANEL.md`), que se migra a este repo.

Fecha del plan: 27/10/2026.

## 1. Decisiones ya tomadas
| Tema | Decisión |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind 3.4 (versiones compatibles con Node 18.14 del entorno actual) |
| Backend | Node + TypeScript con Fastify 4; sirve la API y el frontend compilado; eventos en vivo por SSE |
| Docker | Se invoca la CLI (`docker`, `docker compose`) con `execFile`, sin shell. Un único compose general compartido (`/root/projects/docker-compose.yml`) más `file-manager/docker.compose.minio.yml` |
| Arranque | `npm start` (compila si hace falta y sirve en `127.0.0.1`) |
| Estética | Modo oscuro, pensado para programadores, prioridad permanente (ver §6) |
| Repo | `/root/projects/dev-panel` (este), con su propio git |
| Chat | Fuera de alcance: se usa la extensión de Claude en VS Code a pantalla completa |
| RabbitMQ | Fuera de alcance: ya existe su UI propia |
| Configuración | Todo configurable por `config.json` para poder compartir la herramienta (§3) |

## 2. Funcionalidades (alcance)
1. **Daily:** muestra el MD del día; se genera un borrador desde git y se edita en el panel.
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
  package.json            # workspaces: server, web
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
- **Listo cuando:** `npm install && npm start` abre el panel vacío con tema, y el asistente genera la configuración.

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
- T3.1 **Daily:** carpeta configurable; visor/editor del MD del día; botón "Generar borrador" que junta commits y `git diff --stat` por repo desde el último daily, tickets tocados (por `ticket.json`) y pruebas realizadas; el archivo es temporal (se rota al día siguiente, con opción de archivar).
- T3.2 **Editor de `.env`:** perfiles por repo definidos en `config.json` (ej. "MinIO local" / "S3 remoto"); muestra el diff con valores sensibles enmascarados; respalda el `.env` antes de aplicar; no toca el resto del archivo ni se commitea.
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

## 11. Preguntas para cerrar antes de la Fase 0
1. ¿El daily se guarda en `_EXTRA/daily/AAAA-MM-DD.md` (uno por día, el panel muestra el de hoy) o un único `daily.md` que se pisa a diario?
2. ¿Los presets de chips de levantado se guardan en el panel (por usuario) o en `config.json` compartido?
3. ¿Qué perfiles de `.env` necesitás exactamente (variables que cambian al apuntar a MinIO local)? Con un ejemplo de `firma` y `documentos` armo el esquema.
4. ¿Las skills de Claude que cierran análisis, pruebas y code-review pueden ajustarse para escribir `ticket.json`, o lo escribo a mano al cerrar cada etapa?
