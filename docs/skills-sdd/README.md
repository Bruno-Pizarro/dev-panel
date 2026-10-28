# Skills del pipeline y el Dev Panel

El panel lee `ticket.json` en cada carpeta de la base de conocimiento (convención: [../TICKET_JSON.md](../TICKET_JSON.md)). Quien lo escribe son las **skills de Claude Code** del pipeline, que viven fuera de este repo (`<carpeta de Claude>/skills/<nombre>/SKILL.md`, normalmente `~/.claude/skills`). Sin esta sección en cada skill, las skills siguen funcionando pero el panel solo ve lo que deduce del nombre de la carpeta (sin pruebas, MRs, plan ni tipo).

## Cómo aplicarlo en una máquina nueva
1. Para cada skill de la tabla, copiar el contenido de su archivo de esta carpeta al **final de su `SKILL.md`** (antes de la "Regla meta" si la tiene), como una sección más.
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
