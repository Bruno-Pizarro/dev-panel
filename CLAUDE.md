# Dev Panel — guía para agentes

Panel web local (modo oscuro) para el entorno de desarrollo de e-sueldos. Plan y fases: [docs/PLAN.md](docs/PLAN.md). Convención de `ticket.json`: [docs/TICKET_JSON.md](docs/TICKET_JSON.md). Prototipo previo: `_EXTRA/dev-panel` (no se modifica).

## Qué hace (vistas)
| Vista | Qué hace |
|---|---|
| Inicio | Estado de Docker/contenedores y **chequeos de entorno** (Mongo, obligatorios, tsc trabado, secreto compartido, CA de firma) |
| Servicios | Contenedores, puertos, estado de `tsc`, logs en vivo (SSE), reinicio con confirmación |
| Levantado | Chips de servicios opcionales + presets (compartidos en `config.json`, personales en `data/`); levanta en orden: MinIO → RabbitMQ y Mongo (espera el log de "listo") → obligatorios y elegidos. Valida los nombres contra el compose antes de tocar nada |
| Datos | (los scripts —backup remoto— se leen de la **carpeta de scripts** configurable `paths.scripts`, no viven en este repo; la contraseña usa lógica propia, no un script) Snapshots de colecciones (chips), restauración con verificación de conteo, reseteo de contraseña por mail en todas las bases, backup remoto (envuelve `backup_improved4.sh`), limpieza de datos de prueba por ticket |
| Sesiones de prueba | Entrar como un usuario del entorno local (firma un token con el `JWT_SECRET` de `security`; el panel recuerda y puede cerrar lo que creó) |
| Repos y .env | Ramas por repo (solo lectura) y perfiles de `.env` MinIO local ⇄ remoto (comenta/descomenta, con diff y respaldo) |
| Pruebas / Desarrollo (cada ticket tiene **"Levantar servicios"**: levanta, con el mismo motor del Levantado, los servicios de sus `repos` (o `servicios` de `ticket.json`; `repoServices` en la configuración traduce repo→servicio); **Desarrollo solo muestra lo que desarrollo yo**: los tickets de tipo `revision` —`tipo` en `ticket.json` o marcado en Pruebas— van solo a Pruebas; en Desarrollo hay un check "Listo para pruebas" que lleva a Pruebas) (antes "Planificación"; ruta `/planificacion`) | Lector de `_EXTRA` (cada ticket tiene "Pantalla completa" para concentrarse y "Eliminar carpeta", que exige escribir el nombre y la mueve a `.papelera/` de la base de conocimiento, recuperable a mano) (Pruebas filtra por estado, por defecto sin aprobados, y cada tanda tiene su checklist): informes MD, capturas con visor, MRs, code review, plan, diagrama Mermaid y referencia visual |
| Daily | **Resumen semanal**: botón que copia un pedido para Claude con los datos de la semana por ticket (git, base de conocimiento y Redmine) y el formato del reporte del Google Doc (`services/weekly.ts`, fuente única del formato; el MCP expone la misma herramienta `weekly_report`). Un archivo por día (`AAAA-MM-DD.md`), historial de 5; borrador desde git y `_EXTRA`; checklist de todos los días (entrada, salida, horas); pestaña **Historial** (5 días, solo lectura: commits, push, MRs, reviews, análisis, estimaciones, pruebas; lo más viejo se borra solo) |
| Kanban | **Solo mis tickets** de Redmine (asignados al dueño de la API key) con cambios en los últimos 7/30/60 días, por columna de estado, con SP, horas y última actualización (solo lectura; tope de 100 tickets y 60 días para no hacer llamadas grandes) |
| Configuración | Incluye **Jornada y marcación** (horario de entrada y salida, enlace de marcación: el checklist diario se colorea ámbar/naranja/rojo según el atraso, "Cargar horas" es rojo si ya marcaste salida, y hay un botón "Ir a marcar"). Edita `config.json` (rutas con selector nativo del sistema, orden de levantado, repos) |

Planificación y Pruebas muestran además los datos en vivo del ticket desde **Redmine** (estado, SP, horas, asignado, últimos comentarios). Los **story points** no vienen en `/issues.json`: los guarda el plugin Agile y se leen de `/issues/<id>/agile_data.json` (se piden una vez por ticket y versión y se guardan en `data/sp-cache.json`; si falla, se usa el `[N SP]` del título). La API key se lee de la skill `redmine-drive` (`~/.claude/skills/redmine-drive/config.json`) o de `REDMINE_API_KEY`; solo se hacen lecturas (GET) y la key nunca se guarda en el repo, se registra ni se devuelve al navegador. Se puede apagar con `redmine.enabled: false`.

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
- **Uso en vivo de Claude** (`claudeAccounts.ts`, `claude.liveUsage`, activado por defecto, uso personal): lee el token de acceso de cada cuenta desde su `.credentials.json` y consulta un endpoint **no documentado** de Anthropic. El token vive solo en memoria durante la llamada: nunca se guarda, se loguea ni se devuelve al navegador (hay tests); no renueva tokens. **Solo se consulta a mano** (botón de recargar en la barra y en Cuentas de Claude; ninguna página ni refresco automático lo dispara), como mucho cada 30 s, y ante un 429 respeta `Retry-After` (o 5 min) antes de dejar reintentar. El último dato se guarda en `data/claude-live.json` (solo porcentajes); si no hay, cae al caché de `.claude.json`. Las condiciones de Anthropic restringen a terceros el manejo de tokens de sesión: apagalo (`liveUsage: false`) si el panel se comparte.
- `server/src/services/session.ts` firma tokens con un secreto del entorno local: mantener `session.enabled` apagable y nunca devolver el secreto ni escribirlo en logs.
- Los `.env` solo se tocan desde `routes/env.ts` (cambia el prefijo `# ` de las líneas del perfil, con respaldo en `data/env-backups/`).

## Cómo probar un cambio
1. `yarn typecheck && yarn lint && yarn test`.
2. `yarn build` y abrir el panel; para verificar la interfaz se puede usar Playwright contra `http://127.0.0.1:4777`.
3. Los tests del servidor usan `fastify.inject` (sin red) y archivos temporales; nunca tocan el `config.json` real.

## Convenciones de UI
Componentes base en `web/src/components` (Button, Chip, Card, Modal, Toast, LogView, Markdown, TagEditor, Field…). Colores solo con los tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`…) definidos en `web/src/index.css`. Botones con ícono + texto: usar `icon` de `Button`. Selecciones múltiples: `Chip`.
