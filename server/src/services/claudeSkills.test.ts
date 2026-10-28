import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listSkills, parseFrontmatter } from './claudeSkills.js';

const home = mkdtempSync(join(tmpdir(), 'dp-skills-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('parseFrontmatter', () => {
  it('lee claves simples y descripciones en bloque', () => {
    expect(parseFrontmatter('---\nname: dev\ndescription: >\n  Guía de\n  desarrollo\nversion: "1.2"\n---\n# x')).toEqual({ name: 'dev', description: 'Guía de desarrollo', version: '1.2' });
    expect(parseFrontmatter('sin cabecera')).toEqual({});
  });
});

describe('listSkills', () => {
  it('lista las skills con su última modificación (la de cualquiera de sus archivos), la más nueva primero', () => {
    const base = join(home, '.claude', 'skills');
    mkdirSync(join(base, 'vieja', 'reference'), { recursive: true });
    mkdirSync(join(base, 'nueva'), { recursive: true });
    mkdirSync(join(base, 'sin-manifiesto'), { recursive: true });
    writeFileSync(join(base, 'vieja', 'SKILL.md'), '---\nname: vieja\ndescription: Una vieja\n---\n');
    writeFileSync(join(base, 'vieja', 'reference', 'notas.md'), 'x');
    writeFileSync(join(base, 'nueva', 'SKILL.md'), '---\nname: nueva\n---\n');
    utimesSync(join(base, 'vieja', 'SKILL.md'), new Date('2026-01-01'), new Date('2026-01-01'));
    utimesSync(join(base, 'vieja', 'reference', 'notas.md'), new Date('2026-03-01'), new Date('2026-03-01'));
    utimesSync(join(base, 'nueva', 'SKILL.md'), new Date('2026-02-01'), new Date('2026-02-01'));
    const { skills } = listSkills({ id: 'default', label: 'x', color: '1 1 1', configDir: join(home, '.claude') }, home);
    expect(skills.map((skill) => skill.id)).toEqual(['vieja', 'nueva']);
    expect(skills[0]).toMatchObject({ modifiedFile: 'reference/notas.md', description: 'Una vieja', files: 2 });
    expect(skills[0]!.modifiedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('sin carpeta de skills devuelve una lista vacía', () => {
    expect(listSkills({ id: 'x', label: 'x', color: '1 1 1', configDir: join(home, 'nada') }, home).skills).toEqual([]);
  });
});
