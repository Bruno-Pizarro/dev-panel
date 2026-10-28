import { describe, expect, it } from 'vitest';
import { textileToMarkdown } from './textile';

describe('textileToMarkdown', () => {
  it('deja igual un texto que no es Textile', () => {
    expect(textileToMarkdown('## Ya es Markdown\n\n- uno')).toBe('## Ya es Markdown\n\n- uno');
  });

  it('convierte títulos, citas, negrita, cursiva, código y enlaces', () => {
    const md = textileToMarkdown('h2. Objetivo\n\nConstruir _el Oráculo_ con *mucho* cuidado y @codigo_x@.\n\nbq. Una cita\n\nVer "el artifact":https://claude.ai/a/1.');
    expect(md).toContain('## Objetivo');
    expect(md).toContain('Construir *el Oráculo* con **mucho** cuidado y `codigo_x`.');
    expect(md).toContain('> Una cita');
    expect(md).toContain('[el artifact](https://claude.ai/a/1).');
  });

  it('no toca guiones bajos ni asteriscos dentro de enlaces ni palabras', () => {
    const md = textileToMarkdown('h2. T\n\nsnake_case_name y "x":https://a.com/a_b_c/d');
    expect(md).toContain('snake_case_name');
    expect(md).toContain('[x](https://a.com/a_b_c/d)');
  });

  it('convierte listas anidadas, numeradas y tablas', () => {
    const md = textileToMarkdown('h2. L\n\n* uno\n** dos\n# tres\n\n|_. A|_. B|\n|1|2|');
    expect(md).toContain('- uno\n  - dos\n1. tres');
    expect(md).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('convierte bloques <pre> en código', () => {
    const md = textileToMarkdown('h2. C\n\n<pre>\nconst a = *1*;\n</pre>');
    expect(md).toContain('```\nconst a = *1*;\n```');
  });
});
