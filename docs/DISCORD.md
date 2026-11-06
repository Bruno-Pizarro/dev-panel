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
