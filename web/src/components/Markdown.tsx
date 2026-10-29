import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assetUrl, resolveRelative } from '../lib/tickets';
import { Mermaid } from './Mermaid';
import { MarkdownTable } from './MarkdownTable';

interface MarkdownProps {
  source: string;
  /** Si se indica, las imágenes relativas del MD se sirven desde la carpeta del ticket. */
  ticket?: { dir: string; file: string };
}

const textOf = (node: ReactNode): string => (typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : isValidElement(node) ? textOf((node.props as { children?: ReactNode }).children) : '');

/** Renderiza Markdown (GFM) con el tema oscuro; resuelve imágenes del ticket y dibuja los bloques ```mermaid. */
export const Markdown = ({ source, ticket }: MarkdownProps) => (
  <div className="prose-panel">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt }) => {
          const resolved = ticket && src ? resolveRelative(ticket.file, src) : null;
          return <img src={resolved && ticket ? assetUrl(ticket.dir, resolved) : src} alt={alt ?? ''} loading="lazy" />;
        },
        pre: ({ children }) => {
          const code = Array.isArray(children) ? children[0] : children;
          if (isValidElement(code) && /language-mermaid/.test(String((code.props as { className?: string }).className ?? ''))) {
            return <Mermaid code={textOf(code)} />;
          }
          return <pre>{children}</pre>;
        },
        table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  </div>
);
