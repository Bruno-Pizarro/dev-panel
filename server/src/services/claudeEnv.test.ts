import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClaudeEnvError, deleteVar, listVars, parseEnv, readVars, setVar } from './claudeEnv.js';

const newFile = () => join(mkdtempSync(join(tmpdir(), 'dp-claude-env-')), 'sub', 'claude.env');

describe('variables de Claude', () => {
  it('guarda con permisos 600, lista solo nombres y fechas, y borra', () => {
    const file = newFile();
    setVar('GITHUB_TOKEN', 'valor-inventado-1', { file, now: Date.parse('2026-11-05T10:00:00Z') });
    setVar('OTRA', 'valor-inventado-2', { file });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readVars(file)).toEqual({ GITHUB_TOKEN: 'valor-inventado-1', OTRA: 'valor-inventado-2' });
    const listed = listVars(file);
    expect(listed.map((entry) => entry.name)).toEqual(['GITHUB_TOKEN', 'OTRA']);
    expect(JSON.stringify(listed)).not.toContain('valor-inventado');
    expect(listed[0]).toMatchObject({ setAt: '2026-11-05T10:00:00.000Z', managed: false });
    deleteVar('OTRA', { file });
    expect(Object.keys(readVars(file))).toEqual(['GITHUB_TOKEN']);
    expect(() => deleteVar('OTRA', { file })).toThrow(ClaudeEnvError);
  });

  it('valida el nombre y el valor', () => {
    const file = newFile();
    for (const name of ['minuscula', '1ABC', 'CON ESPACIO', 'A-B', '']) expect(() => setVar(name, 'x1234567', { file })).toThrow(/mayúsculas/);
    for (const value of ['', 'a\nb', 'a\0b', 'x'.repeat(4097)]) expect(() => setVar('OK', value, { file })).toThrow(/valor/);
  });

  it('las variables que administra el panel no se tocan a mano', () => {
    const file = newFile();
    setVar('GITLAB_RW_TOKEN', 'valor-inventado-3', { file, managed: true });
    expect(listVars(file)[0]).toMatchObject({ managed: true });
    expect(() => setVar('GITLAB_RW_TOKEN', 'otro-valor-1', { file })).toThrow(/administra/);
    expect(() => deleteVar('GITLAB_RW_TOKEN', { file })).toThrow(/administra/);
    expect(readFileSync(file, 'utf8')).toContain('GITLAB_RW_TOKEN=valor-inventado-3');
  });

  it('parseEnv ignora comentarios y líneas raras, y respeta el = dentro del valor', () => {
    expect(parseEnv('# nota\nA=1\n\nmal\nB=x=y\n')).toEqual({ A: '1', B: 'x=y' });
  });
});
