/**
 * Los avisos de comentarios (Redmine y Discord) traen el detalle como «título · «mensaje»». Se separa para mostrar el mensaje
 * como tal más claro que el resto. Si el detalle no termina en un mensaje entre « », todo es contexto.
 */
export const splitNoticeMessage = (detail: string): { lead: string; message: string | null } => {
  const match = /^([\s\S]*?)\s·\s«([\s\S]*)»$/.exec(detail);
  return match ? { lead: match[1] ?? '', message: match[2] ?? '' } : { lead: detail, message: null };
};
