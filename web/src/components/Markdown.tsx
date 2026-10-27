import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renderiza Markdown (GFM) con los estilos `.prose-panel` del tema oscuro. */
export const Markdown = ({ source }: { source: string }) => (
  <div className="prose-panel">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
  </div>
);
