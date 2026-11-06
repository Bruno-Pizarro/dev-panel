# Dev Panel

Panel web **local** para el entorno de desarrollo de e-sueldos: levantar el stack en el orden correcto, manejar datos de prueba, seguir tus tickets (pruebas, desarrollo, kanban, daily) y ver tus cuentas y skills de Claude. Es una herramienta personal: corre en tu máquina, solo escucha en `127.0.0.1` y no manda nada a ningún servicio salvo lo que vos configures (Redmine en modo lectura y, opcionalmente, el uso de Claude).

## Requisitos
- Node 18.14 o superior y **yarn** (v1). No usar `npm` ni `npx`.
- Docker con Compose y `git`.
- Opcionales: la CLI `claude` (cuentas y skills) y una API key de Redmine (Kanban y datos de tickets).

## Cada dev, su propio panel
`main` es la **base compartida** y no se modifica. Cada dev trabaja en **su propia rama `dev/<su-nombre>`**, creada desde `main`, e integra ahí las herramientas que le sirven. Los PRs apuntan siempre a la rama propia, nunca a `main`. Detalle y recetas para agregar o sacar cosas: [docs/PERSONALIZAR.md](docs/PERSONALIZAR.md).

## Primer día
```bash
git clone <url-del-repo> dev-panel && cd dev-panel
git switch -c dev/<tu-nombre>
yarn install
yarn doctor      # qué falta configurar y cómo resolverlo (no muestra credenciales)
```
Después abrí **Claude Code en esta carpeta**: su `CLAUDE.md` le indica que revise el entorno con vos, te pida lo que falte (rutas, accesos opcionales, hooks) y te ayude a personalizar el panel. Tus preferencias quedan en `docs/PERSONAL.md` (se crea desde `docs/PERSONAL.example.md`).

## Cómo arrancarlo
```bash
yarn install
yarn start    # compila y sirve todo en http://127.0.0.1:4777
yarn dev      # para desarrollar: servidor con recarga + Vite en http://127.0.0.1:5173
```
En el primer arranque se abre un **asistente** que detecta Docker, tus rutas y los servicios del compose, y escribe `config.json` (queda fuera de git). Después todo se edita desde **Configuración**. `config.example.json` muestra todas las claves.

## Qué tiene
| Pestaña | Para qué |
|---|---|
| Inicio | Semáforo del entorno y checklist del día |
| Servicios | Contenedores, puertos y logs en vivo; reinicio con confirmación |
| Levantado | Levantar los servicios que necesitás (con presets) en el orden correcto |
| Datos | Snapshots de colecciones, contraseñas, backup remoto y limpieza de datos de prueba |
| Sesiones de prueba | Entrar como un usuario del entorno local |
| Repos y .env | Ramas por repo y cambio de `.env` entre MinIO local y remoto |
| Kanban | Tus tickets de Redmine por estado, con story points |
| Pruebas / Desarrollo | Por ticket: informes, capturas, plan, diagramas, descripción y comentarios de Redmine, checklists y la pestaña **Estado** (qué falta antes de abrir los MRs, git de los repos, MRs y pipelines de GitLab, servicios caídos, datos de prueba) |
| Daily | Borrador del daily, historial de 5 días y resumen semanal para Claude |
| Claude | Cuentas con su uso (recarga manual) y skills instaladas con su fecha de modificación |
| Configuración | Rutas, nombre, API key de Redmine, jornada, orden de levantado |

Además: búsqueda rápida (`Ctrl+K`), **temas de color** (selector en la barra superior) y un servidor MCP para que Claude consulte el panel (sin herramientas destructivas: lectura, agregar y publicar en Discord solo a pedido).

## Para usar Pruebas y Desarrollo
Esas vistas leen un `ticket.json` por carpeta de la base de conocimiento (`_EXTRA`), que escriben las skills del pipeline (`ing-requisitos-sdd`, `arquitecto-sdd`, `desarrollador-sdd`, `gitlab-review`, `ship`). Este repo trae la skill [`skills/dev-panel`](skills/dev-panel/SKILL.md) con la convención; se instala con un enlace simbólico y las skills del pipeline (que viven fuera del repo) se preparan una vez por máquina: ver [docs/skills-sdd/](docs/skills-sdd/README.md). Convención del archivo: [docs/TICKET_JSON.md](docs/TICKET_JSON.md).

## Seguridad en una línea
Solo `127.0.0.1`, validación de `Host`/`Origin`, escrituras con cabecera propia, comandos sin shell, confirmación en lo destructivo y ninguna credencial en el repo, los logs ni la pantalla. Detalle en [CLAUDE.md](CLAUDE.md).

## Más documentación
- [CLAUDE.md](CLAUDE.md): guía completa para agentes y desarrolladores (reglas, configuración, credenciales, MCP, cómo probar).
- [docs/PLAN.md](docs/PLAN.md): plan original por fases.
- `yarn verify`: typecheck, lint, tests y build; correrlo antes de commitear.
