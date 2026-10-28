import { Fragment } from 'react';

const PATTERN = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]|#\d{4,6}\b)/g;

/**
 * Texto plano con los enlaces clickeables: URLs y referencias `#12345` (que llevan al ticket de Redmine).
 * Se arma con elementos de React (nunca HTML), así que el contenido del comentario no puede inyectar nada.
 */
export const Linkified = ({ text, issueBaseUrl }: { text: string; issueBaseUrl: string }) => (
  <>
    {text.split(PATTERN).map((part, index) => {
      if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
      const href = part.startsWith('#') ? `${issueBaseUrl}/${part.slice(1)}` : part;
      return <a key={index} href={href} target="_blank" rel="noreferrer noopener" className="break-all text-accent underline-offset-4 hover:underline">{part}</a>;
    })}
  </>
);
