# Investigación: cuentas y uso de Claude en el Dev Panel

Fecha: 27/10/2026. Objetivo: poder tener varias cuentas de Claude, ver su uso de forma fácil, elegir cuál es la activa y mostrar la barra de uso de la sesión en el navbar. Fuentes: documentación oficial de Claude Code (consultada con un agente, lista al final) y lo observado en esta máquina (solo nombres de campos, nunca credenciales).

## 1. Resumen
- **Lo único oficial y programable que trae los porcentajes de la sesión (5 h) y de la semana es el `statusLine`.** Claude Code le pasa por stdin un JSON con `rate_limits.five_hour` y `rate_limits.seven_day` (porcentaje usado y hora de reinicio). Solo para suscripciones Pro y Max, y solo después de la primera respuesta de la sesión.
- **Varias cuentas: `CLAUDE_CONFIG_DIR` es la vía oficial.** Una carpeta de configuración por cuenta; cada una guarda sus propias credenciales, su historial y sus ajustes.
- **No hay endpoint documentado** para consultar el plan con el token OAuth. Las APIs de administración y de analytics no incluyen suscripciones individuales.
- **Los términos de uso** prohíben a desarrolladores de herramientas "recolectar, guardar o intermediar" credenciales o tokens de sesión de claude.ai. Por eso el panel **no debe leer ni mover tokens**.
- **Desde los transcripts locales** se puede calcular el consumo histórico (tokens y costo estimado), pero no los límites del plan. El formato es interno y puede cambiar.

## 2. Qué dato sale de dónde
| Dato | Fuente | Estado | Cómo |
|---|---|---|---|
| % sesión 5 h y % semana + hora de reinicio | `statusLine` (`rate_limits.*`) | Oficial, solo Pro/Max | Script que lee stdin |
| Costo estimado, duración, líneas, modelo, % de contexto, `session_id`, `transcript_path` | `statusLine` | Oficial | Igual |
| Barras en pantalla de sesión/semana | `/usage` (en VS Code: "Account & usage") | Oficial, visual | Comando |
| Cuenta y estado del login | `/status` | Oficial, visual | Comando |
| Tokens y costo por request/modelo | OpenTelemetry (`claude_code.token.usage`, `claude_code.cost.usage`) | Oficial, **sin límites de plan** | Exportador OTel |
| Costo y uso por ejecución | `claude -p --output-format json` | Oficial | Salida JSON |
| Historial de tokens/costo por día | `~/.claude/projects/**/*.jsonl` | Ruta oficial, **formato interno** | Parsear y deduplicar por `message.id` |
| Costo por sesión y por modelo | entradas `cost-state` de esos transcripts | Observado, no documentado | Leer la última por sesión |
| Límite absoluto del plan | — | No se expone | — |
| Uso desde otros equipos o claude.ai | — | Ni `/usage` lo incluye | — |
| Plan vía endpoint directo con el token | "usage endpoint" interno | **No documentado; zona gris de términos** | No usar |
| Usage/Cost Admin API, Claude Code Analytics API | Plataforma Console | Oficial, solo organizaciones; las suscripciones individuales no aplican | — |

## 3. Lo observado en esta máquina
- `~/.claude/.credentials.json` existe y guarda un bloque OAuth (tokens, vencimientos, alcances, tipo de suscripción y nivel de límite). **No se leyeron los valores.**
- `~/.claude/settings.json` **no tiene `statusLine`** configurado. Claude Code 2.1.142.
- Cada mensaje del asistente en los transcripts trae `usage` (entrada, salida, caché de lectura y creación, tokens de razonamiento). **Los mensajes se repiten por el streaming**: en el transcript más largo, 1530 de 1902 ids aparecen más de una vez. Hay que **deduplicar por `message.id`** o se cuenta de más.
- Cada sesión escribe entradas `cost-state` con `totalCostUSD`, duraciones, líneas agregadas/quitadas y `modelUsage` por modelo (tokens y costo). Es la forma más directa de sacar costo por sesión, pero no está documentada.
- La documentación advierte que el formato de los transcripts "es interno y cambia entre versiones": cualquier lector debe tolerar cambios y validarse contra `/usage`.

## 4. Propuesta de diseño (segura)
**Principios:** el panel nunca lee, copia ni guarda tokens; no usa endpoints no documentados; todo lo que escribe en la configuración de Claude lo hace con confirmación y con respaldo.

### A. Cuentas = carpetas de configuración
- Lista de cuentas en el panel: etiqueta + carpeta (`~/.claude-trabajo`, `~/.claude-personal`…), con color.
- "Agregar cuenta": crea la carpeta y muestra el comando de login (`CLAUDE_CONFIG_DIR=<carpeta> claude auth login`). El panel solo comprueba **que exista** el archivo de credenciales, sin abrirlo.
- "Cuenta activa": un puntero guardado en el panel. Para que la extensión de VS Code la use hay que arrancarla con esa variable de entorno (lanzando VS Code con `code .` desde una terminal que la tenga, o con la opción `environmentVariables` de la extensión, con ruta absoluta). El panel genera el comando listo para copiar y el fragmento para la configuración de la extensión; **no edita la configuración de VS Code por su cuenta**.
- Cambiar de cuenta requiere reiniciar la ventana o la extensión: el panel lo avisa.

### B. Barra de uso en el navbar (oficial)
- Un script pequeño (`statusLine`) que guarda el JSON que recibe en `data/claude-usage/<cuenta>.json` (escritura atómica) y devuelve un texto corto.
- El panel lee esos archivos y muestra, para la cuenta activa, dos barras (sesión de 5 h y semana) con el tiempo hasta el reinicio y el costo estimado de la sesión.
- Lo que no puede hacer: actualizarse si no hay una sesión de Claude Code corriendo con esa cuenta. Muestra "último dato hace X" y descarta una ventana cuando pasó su `resets_at`.
- Requiere agregar `statusLine` al `settings.json` de cada cuenta (con confirmación y respaldo). Hoy no está configurado.

### C. Historial de consumo (no oficial, como complemento)
- Lectura de los transcripts de cada cuenta: tokens y costo por día, por proyecto y por modelo, deduplicando por `message.id` y usando `cost-state` cuando exista.
- Marcado en pantalla como "estimado, formato no oficial" y verificado contra `/usage`. Si el formato cambia, se desactiva solo con un aviso.

### D. Descartado
- Leer `.credentials.json` o el llavero para consultar un endpoint interno (riesgo de seguridad y de términos de uso, y sin contrato estable).
- Conmutar cuentas reescribiendo `.credentials.json`.
- OpenTelemetry: sirve para tokens y costo, pero no trae límites; no aporta sobre C.

## 5. Preguntas abiertas (necesitan una prueba en tu entorno)
1. **¿El `statusLine` se ejecuta en la extensión de VS Code?** La documentación habla de la terminal. Si la extensión no lo ejecuta, la barra B solo se actualizaría cuando uses la CLI. Se prueba en 5 minutos configurándolo en una cuenta de prueba.
2. **¿Tu plan expone `rate_limits`?** Solo Pro y Max. Se ve en el primer JSON recibido.
3. **¿Cuántas cuentas y de qué tipo?** (Pro, Max, Team…) y cuál usás en la extensión: define cuánto aporta cada parte.
4. **¿La extensión respeta `CLAUDE_CONFIG_DIR` configurada en sus ajustes?** La documentación lo sugiere (acepta la variable con ruta absoluta) pero no lo afirma; también se prueba.

## 6. Plan por etapas (con Claude escribiendo el código)
| Etapa | Contenido | Esfuerzo |
|---|---|---|
| 0 | Pruebas de las preguntas 1, 2 y 4 con una cuenta de prueba | 0,5 día |
| 1 | Cuentas (carpetas, color, activa, comandos para copiar) | 0,5–1 día |
| 2 | Colector `statusLine` + barras en el navbar y vista de cuentas | 1 día |
| 3 | Historial de consumo desde transcripts, con validación contra `/usage` | 1–1,5 días |

## 7. Fuentes
- https://code.claude.com/docs/en/statusline.md
- https://code.claude.com/docs/en/costs.md
- https://code.claude.com/docs/en/authentication.md
- https://code.claude.com/docs/en/env-vars.md
- https://code.claude.com/docs/en/vs-code.md
- https://code.claude.com/docs/en/monitoring-usage.md
- https://code.claude.com/docs/en/headless.md
- https://code.claude.com/docs/en/sessions.md
- https://code.claude.com/docs/en/legal-and-compliance.md
- https://platform.claude.com/docs/en/manage-claude/usage-cost-api
- https://platform.claude.com/docs/en/manage-claude/claude-code-analytics-api
- ccusage (tercero, no oficial): https://github.com/ryoppippi/ccusage

Limitaciones: el agente no leyó completas las páginas de seguimiento de costos del Agent SDK ni la de hooks; los campos del `statusLine` son los de la documentación vigente y pueden variar con la versión.
