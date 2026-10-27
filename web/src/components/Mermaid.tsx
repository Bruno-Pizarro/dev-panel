import { useEffect, useId, useState } from 'react';

/** Diagrama Mermaid con el tema oscuro del panel. La librería se carga solo cuando hace falta. */
export const Mermaid = ({ code }: { code: string }) => {
  const id = `mmd-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          darkMode: true, background: '#161b22', primaryColor: '#242d3d', primaryTextColor: '#e6edf3', primaryBorderColor: '#8a97ff',
          lineColor: '#8b98a9', secondaryColor: '#1c2330', tertiaryColor: '#161b22', edgeLabelBackground: '#161b22', textColor: '#e6edf3', fontFamily: 'Inter Variable, sans-serif', fontSize: '15px',
        },
      });
      try {
        const result = await mermaid.render(id, code);
        if (active) (setSvg(result.svg), setError(null));
      } catch (reason) {
        if (active) setError((reason as Error).message);
      }
    });
    return () => {
      active = false;
    };
  }, [code, id]);

  if (error) return <pre className="overflow-auto rounded-xl border border-danger/40 bg-danger/10 p-4 font-mono text-sm text-danger">No se pudo dibujar el diagrama: {error}</pre>;
  return <div className="overflow-auto rounded-xl border border-line bg-surface p-5 [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
};
