# Dev Panel — guía para agentes

Panel web local (modo oscuro) para el entorno de desarrollo de e-sueldos: levantar el stack de Docker en orden, ver pruebas y planes por ticket, daily, perfiles de `.env`, snapshots de Mongo. Plan completo y fases: [docs/PLAN.md](docs/PLAN.md). Prototipo previo: `_EXTRA/dev-panel` (no se modifica).

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

## Seguridad (no relajar)
- Solo escucha en `127.0.0.1`; valida `Host` y `Origin`; toda escritura exige la cabecera `X-Dev-Panel: 1` (`web/src/lib/api.ts` ya la pone).
- Los comandos externos se ejecutan con `execFile` (sin shell, `server/src/docker.ts`). Los nombres de servicio/contenedor se validan con lista blanca (`config.ts`).
- Lo destructivo pide confirmación en la UI **y** en el servidor. No operar sobre las bases `admin`, `config`, `local`.
- No modificar el `docker-compose.yml` compartido: el panel solo lo invoca.

## Cómo probar un cambio
1. `yarn typecheck && yarn lint && yarn test`.
2. `yarn build` y abrir el panel; para verificar la interfaz se puede usar Playwright contra `http://127.0.0.1:4777`.
3. Los tests del servidor usan `fastify.inject` (sin red) y archivos temporales; nunca tocan el `config.json` real.

## Convenciones de UI
Componentes base en `web/src/components` (Button, Chip, Card, Modal, Toast, LogView, Markdown, TagEditor, Field…). Colores solo con los tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`…) definidos en `web/src/index.css`. Botones con ícono + texto: usar `icon` de `Button`. Selecciones múltiples: `Chip`.
