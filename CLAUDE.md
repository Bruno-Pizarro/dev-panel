# Dev Panel — guía para agentes

Panel web local (modo oscuro) para el entorno de desarrollo de e-sueldos. Plan y fases: [docs/PLAN.md](docs/PLAN.md). Convención de `ticket.json`: [docs/TICKET_JSON.md](docs/TICKET_JSON.md). Prototipo previo: `_EXTRA/dev-panel` (no se modifica).

## Qué hace (vistas)
| Vista | Qué hace |
|---|---|
| Inicio | Estado de Docker/contenedores, **chequeos de entorno** (Mongo, obligatorios, tsc trabado, secreto compartido, CA de firma) y el checklist diario (el mismo de Daily) |
| Servicios | Contenedores, puertos, estado de `tsc`, logs en vivo (SSE), reinicio con confirmación |
| Levantado | Chips de servicios opcionales + presets (compartidos en `config.json`, personales en `data/`); levanta en orden: MinIO → RabbitMQ y Mongo (espera el log de "listo") → obligatorios y elegidos. Valida los nombres contra el compose antes de tocar nada |
| Datos | (los scripts —backup remoto— se leen de la **carpeta de scripts** configurable `paths.scripts`, no viven en este repo; la contraseña usa lógica propia, no un script) Snapshots de colecciones (chips), restauración con verificación de conteo, reseteo de contraseña por mail en todas las bases, backup remoto (envuelve `backup_improved4.sh`), limpieza de datos de prueba por ticket |
| Sesiones de prueba | Entrar como un usuario del entorno local (firma un token con el `JWT_SECRET` de `security`; el panel recuerda y puede cerrar lo que creó) |
| Repos y .env | Ramas por repo (solo lectura) y perfiles de `.env` MinIO local ⇄ remoto (comenta/descomenta, con diff y respaldo) |
| Pruebas / Desarrollo (cada ticket tiene **"Levantar servicios"**: levanta, con el mismo motor del Levantado, los servicios de sus `repos` **más** los `servicios` de `ticket.json` (lo que hay que tener arriba para probar aunque no se modifique, p. ej. `firma`; `repoServices` en la configuración traduce repo→servicio); **Desarrollo solo muestra lo que desarrollo yo**: los tickets de tipo `revision` —`tipo` en `ticket.json` o marcado en Pruebas— van solo a Pruebas; en Desarrollo hay un check "Listo para pruebas" que lleva a Pruebas) (antes "Planificación"; ruta `/planificacion`) | Lector de `_EXTRA` (cada ticket tiene "Pantalla completa" para concentrarse y "Eliminar carpeta", que exige escribir el nombre y la mueve a `.papelera/` de la base de conocimiento, recuperable a mano) (Pruebas filtra por estado, por defecto sin aprobados, y cada tanda tiene su checklist; su pestaña **Pruebas manuales** es un checklist de casos para probar a mano: salen de `pruebasManuales` en `ticket.json` (cada caso puede traer una `ruta` del front, que se abre contra `session.frontUrl`, por defecto `http://localhost:4200`, con un botón "Abrir"), el usuario puede sumar los suyos y lo tildado vive en `data/manual-tests.json`): informes MD, capturas con visor, MRs, code review, plan, diagrama Mermaid y referencia visual. Ambas tienen la pestaña **Estado** (solo lectura): semáforo "listo para abrir los MRs" (pruebas, vigencia de las pruebas, pruebas manuales, code review, informe, claves i18n pegadas en el front, git limpio/al día/publicado, MRs), última corrida de pruebas por tramo, git de los repos del ticket, MRs y pipelines de GitLab con orden de merge, servicios que necesita el ticket (arriba/caídos) y datos de prueba (conteo `[ticket]`, colas de RabbitMQ sin ack; `services/ticketStatus.ts`, `gitlab.ts`, `ticketHealth.ts`, rutas `/api/tickets/:dir/{ship,git,gitlab,services,test-data}`) |
| Daily | **Resumen semanal**: botón que copia un pedido para Claude con los datos de la semana por ticket (git, base de conocimiento y Redmine) y el formato del reporte del Google Doc (`services/weekly.ts`, fuente única del formato; el MCP expone la misma herramienta `weekly_report`). Un archivo por día (`AAAA-MM-DD.md`), historial de 5; borrador desde git y `_EXTRA`; checklist de todos los días (entrada, salida, horas); pestaña **Historial** (5 días, solo lectura: commits, push, MRs, reviews, análisis, estimaciones, pruebas; lo más viejo se borra solo) |
| Claude | Pestañas **Cuentas** (sesión, uso con recarga manual, comandos de arranque) y **Skills** (las propias de `<configDir>/skills` y las de los plugins instalados, leídas de `<configDir>/plugins/installed_plugins.json` y `enabledPlugins` de `settings.json`, ignorando rutas fuera de `<configDir>/plugins`; con la fecha de última modificación —la del archivo más nuevo o la de actualización del plugin—; solo lectura, `services/claudeSkills.ts`). La carpeta de la cuenta por defecto es `CLAUDE_CONFIG_DIR` si el proceso la tiene definida, si no `~/.claude`; una carpeta distinta se agrega como cuenta |
| Kanban | **Solo mis tickets** de Redmine (asignados al dueño de la API key) con cambios en los últimos 7/30/60 días, por columna de estado, con SP, horas y última actualización (solo lectura; tope de 100 tickets y 60 días para no hacer llamadas grandes) |
| Configuración | Incluye **Jornada y marcación** (horario de entrada y salida, enlace de marcación: el checklist diario se colorea ámbar/naranja/rojo según el atraso, "Cargar horas" es rojo si ya marcaste salida, y hay un botón "Ir a marcar"). Edita `config.json` (rutas con selector nativo del sistema, orden de levantado, repos) |

Desarrollo y Pruebas muestran además los datos en vivo del ticket desde **Redmine** (estado, SP, horas, asignado, últimos comentarios). Los **story points** no vienen en `/issues.json`: los guarda el plugin Agile y se leen de `/issues/<id>/agile_data.json` (se piden una vez por ticket y versión y se guardan en `data/sp-cache.json`; si falla, se usa el `[N SP]` del título). La API key se lee (ver la tabla de credenciales) de `REDMINE_API_KEY`, de `redmine.apiKey` o de la skill `redmine-drive`; solo se hacen lecturas (GET) y la key nunca se guarda en el repo, se registra ni se devuelve al navegador. Se puede apagar con `redmine.enabled: false`.

## Resumen para explicarle el panel al usuario
Si el usuario pregunta "¿qué tengo acá?" o es la primera vez, explicalo así, corto y en este orden (una línea por pestaña; profundizá solo si lo pide):
- **Inicio**: semáforo del entorno (Docker, Mongo, servicios obligatorios, secretos) y el checklist del día.
- **Servicios**: los contenedores, sus puertos y logs en vivo; se pueden reiniciar con confirmación.
- **Levantado**: elegís qué servicios opcionales necesitás (o un preset) y los levanta en el orden correcto, esperando a RabbitMQ y Mongo.
- **Datos**: copias de colecciones (snapshots) y restauración, reseteo de contraseñas, backup remoto y limpieza de los datos de prueba de un ticket.
- **Sesiones de prueba**: entrar como cualquier usuario del entorno local sin conocer su clave.
- **Repos y .env**: en qué rama está cada repo y cambio de los `.env` entre MinIO local y remoto, con diff y respaldo.
- **Kanban**: tus tickets de Redmine por estado, con story points y horas (solo lectura).
- **Pruebas**: cada ticket con sus tandas de pruebas, informes, capturas, conclusión (aprobado / requiere cambios) y un checklist por tanda; una pestaña de **pruebas manuales** (checklist de casos para probar a mano, donde podés sumar los tuyos); también tickets que solo revisás.
- **Estado** (pestaña de Pruebas y Desarrollo): qué falta antes de abrir los MRs, git de los repos, MRs/pipelines de GitLab, servicios caídos y datos de prueba.
- **Desarrollo**: lo que desarrollás vos: análisis, plan, diagramas y datos del ticket (descripción completa, comentarios, SP); desde acá marcás "Listo para pruebas" y levantás los servicios que el ticket necesita para probarse (los de sus repos más los que declare en `ticket.json`).
- **Daily**: borrador del daily a partir de git y la base de conocimiento, historial de 5 días, checklist de entrada/salida/horas y un botón que arma el pedido del resumen semanal para Claude.
- **Claude**: tus cuentas con su uso (se recarga a mano) y las skills instaladas con su fecha de modificación.
- **Configuración**: rutas, tu nombre, la API key de Redmine, el token de GitLab (opcional), horarios de la jornada, orden de levantado y repos.
- **Barra superior**: búsqueda rápida (`Ctrl+K`), uso de Claude con botón de recarga, selector de **tema de colores** (índigo, ámbar, violeta, bosque, océano, rosa, medianoche, eclipse, claro) y estado del servidor. El menú lateral se puede colapsar.
- **Claude puede usar el panel**: hay un servidor MCP de solo lectura (ver "Servidor MCP") para pedirle, por ejemplo, el reporte semanal o el estado del entorno.
Lo que el panel **no** hace: escribir en GitLab o en Redmine (GitLab solo se lee, con token opcional), marcar entrada/salida de verdad ni guardar el historial de consumo de Claude.

## Reglas fijas
- **Siempre `yarn`** (v1.22). Nunca `npm` ni `npx`, ni en scripts, ni en docs, ni en comandos que le pidas al usuario.
- Código (variables, funciones, tipos, archivos) **en inglés**; textos de la interfaz y comentarios en **español**.
- Nada de texto menor a 14 px (en Tailwind `text-xs` y `text-sm` valen 14 px a propósito). Prioridad permanente: estética oscura, cómoda para programadores.
- Sin credenciales en el repo, en logs ni en pantalla: los `.env` de otros repos se muestran siempre enmascarados.
- Git: no crear/cambiar/borrar ramas ni hacer push sin confirmar con el usuario. Commits simples sí.
- Node de esta máquina: 18.14. `.yarnrc` tiene `ignore-engines true` por eso; las versiones están elegidas para Node 18 (Vite 5, Tailwind 3.4, Fastify 4).

## Puesta en marcha en una máquina nueva
```bash
yarn install
yarn dev        # servidor (127.0.0.1:4777) + Vite con recarga (http://127.0.0.1:5173)
# o bien:
yarn start      # compila todo y sirve el panel completo en http://127.0.0.1:4777
```
Primer arranque: el panel abre un **asistente** que detecta Docker, las rutas y los servicios del compose, y escribe `config.json` (fuera de git; ejemplo en `config.example.json`). Se puede cambiar después en la vista Configuración. Variables opcionales: `DEV_PANEL_PORT` (4777), `DEV_PANEL_CONFIG` (ruta de `config.json`), `DEV_PANEL_DATA` (carpeta de datos), `LOG_LEVEL`.

## Primera vez en una máquina: qué revisar con el usuario
Requisitos: Node 18+, `yarn`, Docker con Compose, `git`; la CLI `claude` es opcional (cuentas y skills). El asistente de primer arranque detecta casi todo; confirmá con el usuario:
1. Rutas (`paths.*`): carpeta de proyectos, base de conocimiento (`_EXTRA`), carpeta del Daily y de scripts.
2. Su nombre (`userName`, opcional) y el tema de colores que prefiera (se elige en la barra superior).
3. API key de Redmine (opcional; ver la tabla de credenciales). Sin ella no hay Kanban ni datos de Redmine, pero el resto funciona.
4. Horarios y enlace de marcación (`workday`, opcional).
5. Las skills del pipeline (ver la sección siguiente: **se pregunta, no se modifica solo**).
6. Opcional: registrar el MCP para que Claude consulte el panel (ver "Servidor MCP").

## Referencia de `config.json`
Todo se edita en la vista Configuración; el archivo está fuera de git y `config.example.json` muestra todas las claves. Solo hace falta tocarlo a mano para lo que la pantalla no cubre.
| Clave | Para qué sirve |
|---|---|
| `userName` | Nombre bajo "Dev Panel" (vacío = nada) |
| `paths.projects/extra/daily/scripts` | Carpeta de repos, base de conocimiento, daily y scripts de backup |
| `paths.ignoreDirs` | Carpetas de `_EXTRA` que Pruebas/Desarrollo ignoran (por defecto `daily`; podés sumar `dev-panel` para que no aparezca en los reportes) |
| `compose.main` / `compose.minio` | Los docker-compose que el panel invoca (nunca los modifica) |
| `mongo.*` | Contenedor de Mongo, bases prohibidas, superadmin para resetear contraseñas |
| `remoteBackup.script/types` | Script de backup remoto y sus tipos (chips) |
| `startup.*` | Orden de levantado: etapas 1 y 2, espera de RabbitMQ, obligatorios, opcionales, grupos y presets |
| `repoServices` | Traduce nombre de repo → servicio del compose cuando difieren |
| `envProfiles` | Líneas de `.env` que cambian entre perfiles (MinIO local/remoto) por repo |
| `session.*` | Sesiones de prueba (`enabled` las apaga; dónde está el `JWT_SECRET`, base y URL del front) |
| `gitlab.*` | `enabled`, `token` (opcional), `baseUrl` y `group` para leer el estado de los MRs |
| `redmine.*` | `enabled`, `apiKey` (opcional), `baseUrl`, `configFile` y `doneStatuses` (qué estados cuentan como entregado para los SP semanales) |
| `claude.*` | Binario de la CLI y `liveUsage` (apaga la consulta de uso en vivo) |
| `workday.*` | Horario de entrada/salida y enlace de marcación |
| `checklists.test/daily` | Pasos de cada tanda de pruebas y tareas diarias |
| `git.baseBranch` | Rama base (por defecto `desarrollo`) |
| `checks.*` | Chequeos del Inicio: secreto compartido y carpeta de la CA de firma |
| `testData` | Qué colecciones/campos limpia "Datos de prueba" por ticket |
Datos propios del panel (carpeta `data/`, fuera de git, se puede borrar sin perder código): checklists, estado de tickets, caché de story points, historial de actividad, snapshots, respaldos de `.env`, presets personales y cuentas de Claude.

## Configuración y credenciales (de dónde sale cada cosa)
Un agente que configure el repo en una máquina nueva solo necesita `config.json` (lo crea el asistente del primer arranque o se copia de `config.example.json`) y saber esto:
| Dato | Origen | Notas |
|---|---|---|
| `userName` | `config.json` | Se muestra bajo "Dev Panel" en el menú; vacío = nada |
| Rutas (`paths.*`), compose, servicios | `config.json` | `paths.scripts` es la carpeta de scripts (backup remoto); `paths.ignoreDirs` excluye carpetas de `_EXTRA` |
| **API key de Redmine** | por orden: variable `REDMINE_API_KEY`; `redmine.apiKey` de `config.json` (opcional, campo "API key" en Configuración → Redmine); `api_key` en `~/.claude/skills/redmine-drive/config.json` (o `redmine.configFile`) | Si va en `config.json` queda solo ahí (gitignored, permisos 600): `GET /api/config` nunca la devuelve (solo `apiKeySet`), un campo vacío conserva la guardada y `clearApiKey` la quita. Nunca en el repo ni en `config.example.json`. URL: `redmine.baseUrl`, `REDMINE_URL` o `redmine_url` de la misma skill. Sin key, el panel oculta lo de Redmine y sigue funcionando |
| Uso de Claude | token de `<carpeta de la cuenta>/.credentials.json` (solo en memoria) | Cada cuenta es una carpeta (`CLAUDE_CONFIG_DIR`); se agregan desde la vista Claude (pestaña Cuentas) |
| Secreto de las sesiones de prueba | `JWT_SECRET` del `.env` de `security` (`session.securityEnv`, `session.jwtKey`) | Solo se lee para firmar tokens locales |
| **Token de GitLab** | por orden: variable `GITLAB_TOKEN`; `gitlab.token` de `config.json` (opcional, Configuración → GitLab) | Solo lectura (alcanza `read_api`). Mismo trato que la key de Redmine: `GET /api/config` solo devuelve `tokenSet`, vacío conserva, `clearToken` quita. Se envía únicamente a `gitlab.baseUrl` (la URL de un MR en `ticket.json` solo aporta la ruta del proyecto). Sin token, la sección de MRs del Estado lo indica y el resto sigue. Los MRs y el code review se siguen registrando en `ticket.json` (skills `ship`, `gitlab-review`) |
| Jornada | `workday.*` en `config.json` | Horarios y enlace de marcación |
| Preferencias de pantalla (tema, menú colapsado, filtros) | `localStorage` del navegador | No viajan con el repo |

## Skills del pipeline (para que el panel tenga datos)
Las vistas Pruebas y Desarrollo viven de `ticket.json`, que escriben las skills `ing-requisitos-sdd`, `arquitecto-sdd`, `desarrollador-sdd`, `gitlab-review` y `ship`. Esas skills están **fuera de este repo** (`<carpeta de Claude>/skills`, normalmente `~/.claude/skills`) y por defecto no saben nada del panel: sin la skill `dev-panel` (o la sección "Registro en el Dev Panel" en cada una) el panel igual lista las carpetas, pero sin pruebas, MRs, plan ni tipo.

**La convención completa está en la skill [`skills/dev-panel`](skills/dev-panel/SKILL.md) de este repo** (se instala con un enlace simbólico a `<carpeta de Claude>/skills/dev-panel`, así un `git pull` la actualiza). **Instrucción para el agente que configure el repo: NO instales ni modifiques skills por tu cuenta.** Son del usuario y afectan a todos sus proyectos, no solo a este. En cambio:
1. Comprobá si ya está instalada la skill `dev-panel` y si las cinco la referencian o tienen la sección "Registro en el Dev Panel" en su `SKILL.md`. Si ya está, no hay nada que hacer.
2. Si faltan, **avisale al usuario y preguntale si quiere que las modifiques** para que el panel funcione bien. No avances sin un sí explícito (y si dice que no, el panel se usa igual, con menos datos).
3. Antes de preguntar, **explicale qué se modificaría**, en concreto:
   - A cada `SKILL.md` se le **agrega una sección al final** ("Registro en el Dev Panel"); no se borra ni se reescribe nada existente, y los archivos de apoyo (plantillas, `reference/`) no se tocan.
   - Esa sección le indica a la skill que, al cerrar su etapa, **escriba o actualice `ticket.json`** en la carpeta del ticket de la base de conocimiento (leyendo antes y mezclando, sin pisar lo de otras etapas, sin credenciales). Qué escribe cada una: `ing-requisitos-sdd` → ticket, título, URL, repos y rama; `arquitecto-sdd` → tipo, rama, repos y plan (`plan_abreviado.md`, diagrama `flujo.mmd`), más reglas para que sus diagramas Mermaid dibujen; `desarrollador-sdd` → estado y una entrada por tanda de pruebas; `gitlab-review` → tipo `revision` y una entrada por revisión; `ship` → MRs y estado.
   - Consecuencia visible: las skills van a **crear/modificar archivos `ticket.json` y algún `.md`/`.mmd` en la carpeta del ticket** cada vez que se usen, en todos los proyectos donde se usen.
   - Los cambios son solo en esos 5 archivos y se pueden deshacer borrando la sección.
4. Con el sí del usuario, el texto exacto y los pasos están en [docs/skills-sdd/](docs/skills-sdd/README.md) (ajustá las dos rutas a la máquina) y contá qué archivos tocaste. Las skills no se actualizan solas: al cambiar el texto en `docs/skills-sdd/` hay que recopiarlo, también con el permiso del usuario (Claude → Skills muestra cuándo se modificó cada una).

## Comandos
| Comando | Qué hace |
|---|---|
| `yarn dev` | Servidor con recarga (tsx watch) + Vite |
| `yarn build` | Compila el frontend y el servidor |
| `yarn start` | `build` y arranca el servidor, que también sirve el frontend |
| `yarn typecheck` | `tsc --noEmit` en server y web |
| `yarn lint` | ESLint en server y web |
| `yarn test` | Vitest en server y web |
| `yarn verify` | typecheck + lint + test + build (correrlo antes de commitear) |

Para un solo paquete: `yarn workspace @dev-panel/server test`, `yarn workspace @dev-panel/web build`.

## Estructura
```
server/src   Fastify + TypeScript (ESM): config.ts, security.ts, docker.ts, sse.ts, routes/
web/src      React 18 + Vite + Tailwind: components/ (UI base), views/, lib/ (api, nav, hooks)
docs/        PLAN.md
data/        snapshots y respaldos (ignorado en git)
config.json  configuración local de la máquina (ignorado en git)
```
Vistas pendientes (marcadas F1…F3 en el menú) se construyen por fases según `docs/PLAN.md`.

## Servidor MCP (para que Claude use el panel)
`server/src/mcp.ts` es un servidor MCP por stdio que **le habla al panel ya corriendo** (`yarn start`). Se registra una vez por máquina:
```bash
yarn build
claude mcp add dev-panel -- node /ruta/a/dev-panel/server/dist/mcp.js
```
Usar `node` directo (no `yarn`): yarn imprime banners por stdout y rompe el protocolo. Herramientas: `checks`, `containers`, `startup_plan`, `startup_run`, `startup_state`, `tickets`, `ticket_detail`, `repos`, `env_status`, `daily_draft`, `weekly_report`, `activity`, `daily_checklist`, `redmine_issue`, `kanban`, `sp_history`, `snapshots`, `testdata`. **A propósito no expone nada destructivo** (restaurar datos, resetear contraseñas, sesiones, limpiar datos, reiniciar contenedores, cambiar `.env`, detener): eso queda en la interfaz, con confirmación. Lo comprueba un test (`mcpTools.test.ts`); no agregar herramientas destructivas.

## Seguridad (no relajar)
- Solo escucha en `127.0.0.1`; valida `Host` y `Origin`; toda escritura exige la cabecera `X-Dev-Panel: 1` (`web/src/lib/api.ts` ya la pone).
- Los comandos externos se ejecutan con `execFile` (sin shell, `server/src/docker.ts`). Los nombres de servicio/contenedor se validan con lista blanca (`config.ts`).
- Lo destructivo pide confirmación en la UI **y** en el servidor. No operar sobre las bases `admin`, `config`, `local`.
- No modificar el `docker-compose.yml` compartido: el panel solo lo invoca.
- **Uso en vivo de Claude** (`claudeAccounts.ts`, `claude.liveUsage`, activado por defecto, uso personal): lee el token de acceso de cada cuenta desde su `.credentials.json` y consulta un endpoint **no documentado** de Anthropic. El token vive solo en memoria durante la llamada: nunca se guarda, se loguea ni se devuelve al navegador (hay tests); no renueva tokens. **Solo se consulta a mano** (botón de recargar en la barra y en Claude → Cuentas; ninguna página ni refresco automático lo dispara), como mucho cada 30 s, y ante un 429 respeta `Retry-After` (o 5 min) antes de dejar reintentar. El último dato se guarda en `data/claude-live.json` (solo porcentajes); si no hay, cae al caché de `.claude.json`. Las condiciones de Anthropic restringen a terceros el manejo de tokens de sesión: apagalo (`liveUsage: false`) si el panel se comparte.
- `server/src/services/session.ts` firma tokens con un secreto del entorno local: mantener `session.enabled` apagable y nunca devolver el secreto ni escribirlo en logs.
- Los `.env` solo se tocan desde `routes/env.ts` (cambia el prefijo `# ` de las líneas del perfil, con respaldo en `data/env-backups/`).

## Cómo probar un cambio
1. `yarn typecheck && yarn lint && yarn test`.
2. `yarn build` y abrir el panel; para verificar la interfaz se puede usar Playwright contra `http://127.0.0.1:4777`.
3. Los tests del servidor usan `fastify.inject` (sin red) y archivos temporales; nunca tocan el `config.json` real.

## Convenciones de UI
Componentes base en `web/src/components` (Button, Chip, Card, Modal, Toast, LogView, Markdown, TagEditor, Field…). Colores solo con los tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`…) definidos en `web/src/index.css`. **Temas**: cada uno redefine esas variables con `[data-theme='…']` en el mismo archivo y se registra en `web/src/lib/theme.ts` (selector en la barra superior, se guarda en el navegador); no usar colores fijos en componentes nuevos (para librerías sin CSS, `themeColor()`). Los registros en consola (`.console`) siguen oscuros en el tema claro por los colores ANSI. Botones con ícono + texto: usar `icon` de `Button`. Selecciones múltiples: `Chip`.
