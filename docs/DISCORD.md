# Discord: foro de MRs del equipo

Foro del servidor **eSueldos-v3-dev** donde cada ticket tiene una publicación (hilo) con sus MRs. El Dev Panel puede **crear ese hilo con el formato del equipo** y actualizarlo cuando suma MRs; **nunca publica solo**: lo pide el usuario con el botón «Publicar en Discord» (pestaña Estado del ticket) o le pide a Claude que use el MCP (`discord_publish`).

## Reglas del canal (las directivas del servidor)
- Siempre el **número de ticket en el título**: `[Ticket #33526] Pestaña Pendientes de firma en el Perfil`.
- Formato del mensaje (un `repo: enlace` por línea):
  ```
  🎫 **Ticket**: https://redmine.icono-cloud.com/issues/33526

  📝 **Merge Requests**
  front: https://git.icono-cloud.com/e-sueldos-v3/front/-/merge_requests/165
  legajo: https://git.icono-cloud.com/e-sueldos-v3/legajo/-/merge_requests/65
  ```
- **Obligatorio** elegir las etiquetas de todos los repositorios involucrados (Discord admite hasta 5 por publicación).
- Las etiquetas «Estado: …» las pone una persona a mano: «Estado: Testeado» = aprobado y pasó a Testeado en Redmine. «Estado: Consultoría» no se usa.
- Con la etiqueta «Estado: Producción» se **elimina** la publicación (a mano; el webhook no puede borrar).
- Todos los mensajes y discusiones del ticket van en la publicación.

## Sin tarjetas de enlace y mención
- Los enlaces del mensaje van entre `<…>` y el hilo se crea con el flag de «sin embeds»: se ven igual de clicables pero **sin la tarjeta con el logo de GitLab/Redmine**. El permiso «Insertar enlaces» del canal no frena a un webhook (no es un miembro), por eso se pide en el propio mensaje.
- Con tu **id de usuario de Discord** cargado en Configuración → Discord (`discord.userId`, un número: Ajustes → Avanzado → Modo desarrollador → clic derecho sobre tu nombre → Copiar ID de usuario) el mensaje suma al final `👤 @vos`, así quedás en la lista de miembros del hilo. Solo menciona a ese usuario (nunca `@everyone` ni roles); como te menciona, Discord te notifica a vos.

## Etiquetas del foro (ids)
No son secretos (sin acceso al servidor no sirven de nada). Se cargan en `config.json` → `discord.tags`, por nombre de **carpeta del repo**.

| Repo (carpeta) | Etiqueta | Id |
|---|---|---|
| front | Front | 1546517585384972329 |
| panel | Panel | 1546518613891223613 |
| security | Security | 1546518654051418142 |
| legajo | Legajo | 1546517682697019402 |
| liquidacion | Liquidación | 1546517890776170556 |
| control-horario | Control horario | 1546518078253170739 |
| recibos | Recibos | 1546519500273487883 |
| file-manager | Files | 1546519612630499428 |
| documentos | Documentos | 1546519145905135677 |
| leia | LeIA | 1546519026065219707 |
| incidencia | Incidencia | 1546518816299814962 |
| notificaciones | Notificaciones | 1546519238389530654 |
| proyectos | Proyectos | 1546519330185814066 |
| cursos | Cursos | 1546519404647292928 |
| firma | Firma | 1546519721145405470 |
| recruiting | Recruiting | 1546519849617068123 |
| (otro) | Otro (aclarar) | 1546519950846459915 |
| — | Estado: Testeado (aprobado) | 1546906941333438594 |
| — | Estado: Consultoría (sin uso) | 1546907183143325737 |

## Webhook (secreto)
La URL del webhook del foro **da permiso para publicar**: va solo en las variables de Claude del panel (pestaña Claude → Variables), con el nombre `DISCORD_WEBHOOK_MR`. Nunca en el repo, en un MD ni en un chat. El webhook publica con el nombre «<userName> · Dev Panel». Puede crear hilos con etiquetas y editar **sus propios** mensajes (por eso el panel guarda en `data/discord-threads.json` el id del hilo y del mensaje inicial); no puede leer, borrar ni cambiar las etiquetas de un hilo ya creado, ni tocar los hilos que se crearon a mano.

## Bot del equipo: lectura (etapa 2) y mensajes al hilo (etapa 3)
Un bot **compartido por el equipo** lee el foro de MRs para que el panel y Claude sepan qué pasa en los hilos, incluidos los que se crean a mano. **La lectura no envía nada**; los mensajes al hilo (etapa 3, abajo) son una función aparte, manual y que necesita permisos extra.

**Configurarlo (una sola vez, en el portal de desarrolladores de Discord)**
1. Crear la aplicación y su bot. En *Bot → Privileged Gateway Intents* activar **Message Content Intent** (sin esto Discord entrega los mensajes sin texto).
2. Invitarlo al servidor con **solo dos permisos**: **Ver canales** y **Leer el historial de mensajes** (nada de enviar mensajes, gestionar, mencionar ni reacciones). Mejor aún: darle esos dos permisos solo sobre el canal foro de MRs.
3. Copiar el token del bot y cargarlo en Claude → Variables como `DISCORD_BOT_TOKEN` (cada dev lo pega en su panel; se comparte por un canal privado, nunca por el foro ni por un chat con Claude).
4. El id del canal foro va en `discord.channelId` de `config.json` (ya está: `1546517490127872020`) y la etiqueta «Estado: Testeado» en `discord.approvedTag`.

**Qué hace hoy**
- `GET /api/discord/threads` (caché de 5 min, `?refresh=1` fuerza): hilos del foro (activos y archivados) con ticket (sacado del `#número` del título), etiquetas por nombre, respuestas, última actividad, si está aprobado (`Estado: Testeado`) y enlace.
- En Pruebas y Desarrollo, el encabezado del ticket muestra **Hilo en Discord** si hay un hilo con su número.
- MCP (solo lectura): `discord_threads` y `discord_thread_messages` (últimos mensajes de un hilo, con secretos tapados y recortados, solo hilos del foro configurado) para que Claude saque conclusiones, vea en qué quedó una revisión o arme el daily.
- Se consulta la API cada tanto, no hay conexión abierta. El token nunca se devuelve ni se registra.

**Menciones por nombre.** `discord.people` (en `config.json`, **local**, nunca en el repo) guarda quién es cada id de Discord (`{ "Mariano": "123…" }`, varios nombres pueden apuntar al mismo id) para pedir «avisale a Mariano» sin buscar el id. Son datos de personas: se comparten por un canal privado del equipo. `config.example.json` trae solo un ejemplo inventado.

**Ya no aplica:** la etiqueta «Estado: Producción» no existe ni va a existir; no hay aviso de borrar la publicación por eso.

**Hilos a mano y duplicados.** La tarjeta «Discord · foro de MRs» (pestaña Estado) también consulta al bot: si el foro ya tiene un hilo con el número del ticket y NO lo creó el panel, muestra «hilo existente» con su enlace y **no deja crear otro** (se duplicaría, y el webhook no puede editar hilos ajenos). Si el bot no está configurado o falla, se comporta como antes.

**Avisos del Inicio** (`services/discordNotices.ts`). En «Para tener en cuenta» aparecen, con el tipo «Discord»: alguien escribió en el hilo de un ticket tuyo, te mencionaron (en cualquier hilo) o le pusieron «Estado: Testeado» a un ticket tuyo. «Tus tickets» = las carpetas de `_EXTRA` que no son de revisión. Los mensajes tuyos no cuentan: hace falta tu id de usuario (Configuración → Discord). A diferencia de los otros avisos no se revisan una vez por día sino al pedir el Inicio (los hilos se guardan 5 min); la primera vez solo toma la foto del foro (no avisa de nada viejo), cada aviso se conserva 36 h, y se mira como máximo 8 hilos con novedades por vez. El estado vive en `data/discord-notices.json`.

## Mensajes al hilo del ticket (etapa 3)
El panel puede **mandar un mensaje al hilo de un ticket** etiquetando a las personas por nombre. Es **siempre manual**: lo pedís vos con el botón o le pedís a Claude que use el MCP; nunca se envía solo ni como reacción a un push.
- **Permisos del bot:** además de los de lectura, **Enviar mensajes** y **Enviar mensajes en hilos** (se agregan al invitarlo; sin ellos Discord responde 403 `Missing Permissions` y el panel lo muestra).
- **Panel:** pestaña Estado → tarjeta «Discord · foro de MRs» → «Mensaje al hilo» (aparece cuando el ticket tiene hilo, creado por el panel o a mano). Escribís el texto, marcás las personas, pedís la **vista previa** (muestra exactamente qué sale y a quién menciona) y recién entonces «Enviar al hilo». Cualquier cambio apaga el envío hasta una nueva vista previa.
- **MCP:** `discord_message_preview` (no envía) y `discord_message_send` (solo si el usuario lo pidió en esa conversación; muestra antes la vista previa).
- **Nombres:** salen de `discord.people` (local, ver arriba); no distinguen mayúsculas ni tildes. Un nombre que no está se avisa y bloquea el envío, no se ignora en silencio.
- **Seguridad:** solo se menciona a quienes nombrás (`allowed_mentions` sin `@everyone`, `@here` ni roles, aunque el texto los escriba); los enlaces no arman tarjeta; el mensaje admite hasta 1800 caracteres. El token es el mismo del bot (`DISCORD_BOT_TOKEN`) y nunca se devuelve ni se registra. Los tests usan un bot simulado: nunca postean a Discord.
