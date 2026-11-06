# Personalizar tu Dev Panel

Este documento es para vos (y para tu sesión de Claude): explica **cómo se trabaja con el repo** y **cómo agregar o sacar cosas** sin romper nada ni pisar a los demás.

## 1. El modelo: cada uno tiene su propio panel

- `main` es la **base compartida**. La mantiene Bruno (el dueño del repo). **Nadie la modifica** y no se hacen PRs a `main`.
- Cada dev tiene **su propia rama: `dev/<tu-nombre>`**, creada desde `main`. Esa rama es **tu** Dev Panel: ahí integrás las herramientas que te sirven para tu flujo, sacás las que no usás y cambiás lo que quieras. **Solo vos modificás tu rama.**
- Para trabajar por partes, creás ramas de tema y las integrás **en tu rama**:
  - Ramas de tema: `feature/<tu-nombre>-<tema>` (no `dev/<tu-nombre>/<tema>`: Git no permite que `dev/ana` sea a la vez una rama y una carpeta de ramas).
  - **Todo PR apunta a tu rama `dev/<tu-nombre>`, nunca a `main`.** (En GitHub, al abrir el PR cambiá la base a tu rama.)
- ¿Algo que hiciste le serviría a todos? No se manda un PR a `main`: se lo contás a Bruno y él decide si lo lleva a la base.

### Primer paso en una máquina nueva
```bash
git clone <url-del-repo> dev-panel && cd dev-panel
git switch -c dev/<tu-nombre>        # tu rama personal, desde main
git push -u origin dev/<tu-nombre>   # (opcional) respaldo en GitHub
yarn install
yarn doctor                          # te dice qué falta configurar
```
Después abrí Claude Code en la carpeta del repo: su `CLAUDE.md` le indica qué revisar con vos.

### Traer las novedades de la base
Cuando Bruno mejora `main`, vos decidís cuándo traerlo a tu rama:
```bash
git fetch origin
git merge origin/main        # estando en tu rama dev/<tu-nombre>
yarn verify                  # typecheck + lint + tests + build
```
Si hay conflictos, resolvelos conservando **tus** cambios y las novedades (pedile ayuda a Claude y mirá el diff antes de aceptar). Cuanto menos toques los archivos compartidos (ver §4), menos conflictos.

## 2. Tus preferencias (para que Claude te conozca)
Copiá `docs/PERSONAL.example.md` a **`docs/PERSONAL.md`** y completalo: cómo trabajás, qué vistas usás, qué querés que Claude te pregunte siempre, decisiones de configuración y extensiones que fuiste agregando. Claude lo lee al empezar cada sesión. Es de tu rama: no genera conflictos porque en `main` no existe.

## 3. Reglas que no se negocian
- **Siempre `yarn`** (v1). Nunca `npm` ni `npx`.
- Código (variables, funciones, tipos, archivos) **en inglés**; textos de la interfaz y comentarios **en español**.
- Nada de texto menor a 14 px (`text-xs` y `text-sm` ya valen 14 px). Colores solo con los tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`…).
- **Sin credenciales** en el repo, en logs, en pantalla ni en el chat. Los tokens van en Configuración o en Claude → Variables.
- **Seguridad del panel:** solo `127.0.0.1`, comandos con `execFile` (sin shell), lo destructivo pide confirmación en la UI **y** en el servidor, y el MCP **no expone nada destructivo** (solo lectura o «agregar»; lo comprueba `mcpTools.test.ts`).
- Git: nada de crear/cambiar/borrar ramas ni push sin que vos lo confirmes. Commits simples sí.
- Antes de dar algo por terminado: **`yarn verify`** en verde, y probar la pantalla en el navegador.

## 4. Cómo agregar cosas (recetas)
Regla de oro para no tener conflictos al traer `main`: **archivos nuevos para lo tuyo y cambios mínimos (una línea) en los compartidos.** Los archivos compartidos más tocados son `web/src/lib/nav.ts`, `web/src/App.tsx`, `server/src/app.ts`, `server/src/mcpTools.ts`, `server/src/config.ts` y `CLAUDE.md`. No reformatees ni reordenes nada en ellos.

### Una vista nueva
1. `web/src/views/MiVista.tsx` (componente nuevo).
2. Una entrada en `web/src/lib/nav.ts` (`path`, `label`, `description`, `icon` de lucide, `phase: null`).
3. Una `<Route path="mi-vista" element={<MiVista />} />` en `web/src/App.tsx`, y el path en la lista de exclusiones del `ComingSoon` de ese mismo archivo.
4. Opcional: letra del atajo `g` + letra en `GOTO_DEFAULTS` de `web/src/lib/shortcuts.ts`.
5. Componentes base en `web/src/components` (`Button`, `Chip`, `Card`, `Modal`, `Toast`, `Field`…). Botones con ícono: la prop `icon`.

### Un servicio / endpoint nuevo
1. `server/src/services/miServicio.ts` con la lógica y `miServicio.test.ts` al lado. Los tests usan archivos temporales, `fastify.inject` o ejecutores simulados; **nunca** tocan Docker, Redmine, GitLab o Discord reales.
2. `server/src/routes/miServicio.ts` con `registerMiServicioRoutes(app)`, validando la entrada con `zod`. Toda escritura exige la cabecera `X-Dev-Panel: 1` (el cliente `web/src/lib/api.ts` ya la manda).
3. Registrarlo con una línea en `server/src/app.ts`.
4. Datos propios en `data/` (ignorada por git; usar `paths.data`).
5. Comandos externos solo con el `run` de `server/src/docker.ts` (`execFile`); nombres de contenedores/servicios con lista blanca.

### Que Claude lo use (herramienta MCP)
Una entrada en `server/src/mcpTools.ts` (nombre, descripción, `shape` con `zod`, `run`). Solo lectura o «agregar»: **nada que borre, edite o reinicie**. Si publica algo hacia afuera (Discord, GitLab…), la descripción tiene que decir «solo a pedido del usuario» y exigir la vista previa antes. Después actualizá `mcpTools.test.ts` (la lista de POST permitidos).

### Un paso del checklist diario
Configuración → `checklists.daily` (o el default en `server/src/config.ts`). El id sale del texto («Cargar notas» → `cargar-notas`). Para que se coloree según la hora, `web/src/lib/workday.ts`.

### Un aviso del Inicio
`server/src/services/homeNotices.ts` (avisos que se calculan una vez por día) o los recordatorios/rutinas (se calculan al pedirlos). Cada tipo se enciende en `home.*` de la configuración.

### Frases del saludo
`web/src/lib/greetings.ts`. Las frases con `{name}` solo salen si hay nombre. Para «mañana» usá `{tomorrow}` / `{Tomorrow}` (dice «el lunes» si mañana no se trabaja).

### Una opción de configuración
1. Esquema `zod` + valor por defecto en `server/src/config.ts`.
2. Ejemplo en `config.example.json`.
3. Campo en `web/src/views/ConfigEditor.tsx` si querés editarla desde la pantalla.
4. Si es un secreto: lo habitual es Claude → Variables; en `config.json` solo si ya hay un patrón (Redmine, GitLab) y nunca se devuelve al navegador.

### Un tema de color
Variables en `web/src/index.css` con `[data-theme='…']` y registro en `web/src/lib/theme.ts`.

### Sacar lo que no usás
- Ocultar una vista: borrar su entrada en `web/src/lib/nav.ts` (la ruta puede quedarse).
- Apagar avisos: Configuración → Inicio (`home.*`). Redmine: `redmine.enabled: false`. GitLab: `gitlab.enabled: false`. Sesiones de prueba: `session.enabled: false`.
- Sacar un servicio entero (servicio, ruta, test, línea en `app.ts`, MCP, vista): en un commit aparte, para poder revertirlo.

### Skills del pipeline
Son tuyas y afectan a todos tus proyectos: **no se modifican sin tu OK explícito**. Ver «Skills del pipeline» en `CLAUDE.md`.

## 5. Dónde está cada cosa
| Carpeta | Qué hay |
|---|---|
| `server/src/services` | Lógica (Docker, Mongo, Redmine, GitLab, Discord, tickets, avisos…) |
| `server/src/routes` | Endpoints HTTP (`/api/...`) |
| `server/src/mcpTools.ts` | Herramientas que Claude puede usar |
| `server/scripts` | Utilidades de terminal: `doctor`, `dpx`, instaladores de hooks |
| `web/src/views` | Una pantalla por vista |
| `web/src/components` | Piezas de interfaz reutilizables |
| `web/src/lib` | Menú, atajos, frases, temas, cliente de la API |
| `skills/dev-panel` | La skill que registra el avance de cada ticket en `ticket.json` |
| `docs` | Esta guía, Discord, convención de `ticket.json`, plan |
| `config.json`, `data/` | **Tuyos**, fuera de git (rutas, accesos opcionales, historial, snapshots) |

## 6. Cosas que son de cada máquina (no se versionan)
`config.json`, `data/`, el archivo de variables de Claude en `~/.config/dev-panel/`, los hooks y guardas de `~/.claude/settings.json` (los instalás **vos** con los scripts de `server/scripts`) y tus skills. Si algo de esto falta en una máquina nueva, `yarn doctor` lo dice.
