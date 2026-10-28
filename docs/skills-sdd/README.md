# Skills del pipeline y el Dev Panel

El panel lee `ticket.json` en cada carpeta de la base de conocimiento. Lo escriben las **skills de Claude Code** del pipeline, que viven fuera de este repo.

## La skill `dev-panel` (fuente única de la convención)
Este repo trae la skill [`skills/dev-panel/SKILL.md`](../../skills/dev-panel/SKILL.md): todo el esquema de `ticket.json`, qué campo escribe cada etapa, cómo redactar `pruebasManuales` y `servicios`, y las reglas de Mermaid. Se instala **con un enlace**, así un `git pull` la actualiza sin recopiar nada:
```bash
ln -s <ruta-del-repo>/skills/dev-panel <carpeta-de-claude>/skills/dev-panel   # normalmente ~/.claude/skills/dev-panel
```
Con la skill instalada, Claude la usa cuando se le pide registrar el avance de un ticket. Para que **cada skill del pipeline la use sola al cerrar su etapa**, hay que agregarles una referencia (ver abajo).

## Referencia en cada skill del pipeline (opcional, recomendada)
**Un agente no debe aplicar esto por su cuenta**: primero tiene que avisarle al usuario, explicarle qué se modifica (una sección agregada al final de cada `SKILL.md`; las skills pasan a escribir `ticket.json` y algunos `.md`/`.mmd` en la carpeta de cada ticket, en todos los proyectos donde se usen) y esperar un sí explícito. Detalle en la sección "Skills del pipeline" de [../../CLAUDE.md](../../CLAUDE.md).

1. Para cada skill de la tabla, copiar el contenido de su archivo de esta carpeta al **final de su `SKILL.md`** (es la versión larga de la convención; si ya instalaste la skill `dev-panel`, alcanza con que cada una diga "al cerrar tu etapa, seguí la skill `dev-panel`" y liste sus campos) (antes de la "Regla meta" si la tiene), como una sección más.
2. Ajustar las dos rutas del texto a la máquina: la carpeta de la base de conocimiento (`/root/projects/_EXTRA`) y la del panel (`/root/projects/dev-panel`).
3. Las skills no se actualizan solas: si el texto cambia acá, hay que volver a copiarlo. En el panel, Claude → Skills muestra la fecha de la última modificación de cada una.

| Skill | Archivo | Qué escribe en `ticket.json` |
|---|---|---|
| `ing-requisitos-sdd` | [ing-requisitos-sdd.md](ing-requisitos-sdd.md) | `ticket`, `titulo`, `url`, `repos`, `rama`; diagrama `flujo.mmd` opcional |
| `arquitecto-sdd` | [arquitecto-sdd.md](arquitecto-sdd.md) | `tipo: desarrollo`, `rama`, `repos`, `plan.*`; reglas de Mermaid |
| `desarrollador-sdd` | [desarrollador-sdd.md](desarrollador-sdd.md) | `estado`, una entrada nueva en `pruebas[]` por tanda |
| `gitlab-review` | [gitlab-review.md](gitlab-review.md) | `tipo: revision`, una entrada nueva en `codeReview[]` |
| `ship` | [ship.md](ship.md) | `mrs[]`, `estado` |

Reglas comunes (están en cada sección): leer antes de escribir y mezclar sin pisar lo de otras etapas, JSON válido, fechas `AAAA-MM-DD`, rutas relativas, sin credenciales y omitir lo que no se sabe.
