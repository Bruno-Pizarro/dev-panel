import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isAllowedTranscript, lastAgentReply, readAgentReply } from './agentTranscript.js';

const line = (value: unknown) => JSON.stringify(value);
const assistant = (...content: unknown[]) => line({ type: 'assistant', message: { role: 'assistant', content } });
const text = (value: string) => ({ type: 'text', text: value });
const handback = (message: string) => ({ type: 'tool_use', name: 'SubagentHandback', input: { message } });

describe('lastAgentReply', () => {
  it('toma el último texto del asistente', () => {
    const jsonl = [assistant(text('Primero')), line({ type: 'user', message: { role: 'user', content: 'x' } }), assistant(text('Informe final'))].join('\n');
    expect(lastAgentReply(jsonl)).toBe('Informe final');
  });

  it('si el agente entrega su informe con SubagentHandback, usa ese mensaje', () => {
    const jsonl = [assistant({ type: 'tool_use', name: 'Read', input: { file_path: '/x' } }), assistant(handback('Informe por handback'))].join('\n');
    expect(lastAgentReply(jsonl)).toBe('Informe por handback');
  });

  it('gana lo último, sea texto o handback', () => {
    expect(lastAgentReply([assistant(handback('viejo')), assistant(text('nuevo'))].join('\n'))).toBe('nuevo');
    expect(lastAgentReply([assistant(text('viejo')), assistant(handback('nuevo'))].join('\n'))).toBe('nuevo');
  });

  it('ignora líneas rotas, entradas que no son del asistente, pensamientos y herramientas comunes', () => {
    const jsonl = ['{ cortada', assistant({ type: 'thinking', thinking: 'secreto interno' }), assistant({ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }), line({ type: 'attachment' }), assistant(text('   '))].join('\n');
    expect(lastAgentReply(jsonl)).toBeNull();
    expect(lastAgentReply('')).toBeNull();
  });
});

describe('transcripciones permitidas', () => {
  const claude = mkdtempSync(join(tmpdir(), 'dp-claude-'));
  const outside = mkdtempSync(join(tmpdir(), 'dp-outside-'));
  mkdirSync(join(claude, 'projects', 'p', 'subagents'), { recursive: true });
  const good = join(claude, 'projects', 'p', 'subagents', 'agent-1.jsonl');
  writeFileSync(good, [assistant(text('Hecho'))].join('\n'));
  const notInProjects = join(claude, 'settings.jsonl');
  writeFileSync(notInProjects, assistant(text('no')));
  const elsewhere = join(outside, 'otro.jsonl');
  writeFileSync(elsewhere, assistant(text('no')));
  const link = join(claude, 'projects', 'p', 'enlace.jsonl');
  symlinkSync(elsewhere, link);
  afterAll(() => {
    rmSync(claude, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('acepta un .jsonl dentro de projects/ de una carpeta de Claude y lee su informe', () => {
    expect(isAllowedTranscript(good, [claude])).toBe(true);
    expect(readAgentReply(good, [claude])).toBe('Hecho');
  });

  it('rechaza lo que está fuera de projects/, de otra carpeta, un enlace que escapa, rutas raras y archivos que no son .jsonl', () => {
    expect(readAgentReply(notInProjects, [claude])).toBeNull();
    expect(readAgentReply(elsewhere, [claude])).toBeNull();
    expect(readAgentReply(link, [claude])).toBeNull();
    expect(readAgentReply(good, [outside])).toBeNull();
    expect(readAgentReply(join(claude, 'projects', '..', 'settings.jsonl'), [claude])).toBeNull();
    expect(readAgentReply('relativa/agent.jsonl', [claude])).toBeNull();
    expect(readAgentReply(join(claude, 'projects', 'p', 'subagents', 'agent-1.txt'), [claude])).toBeNull();
    expect(readAgentReply(join(claude, 'projects', 'p', 'no-existe.jsonl'), [claude])).toBeNull();
    expect(readAgentReply(undefined, [claude])).toBeNull();
    expect(readAgentReply(42, [claude])).toBeNull();
  });

  it('en un archivo enorme lee solo el final y descarta la línea cortada del principio', () => {
    const big = join(claude, 'projects', 'p', 'grande.jsonl');
    const filler = line({ type: 'user', message: { role: 'user', content: 'x'.repeat(1000) } });
    writeFileSync(big, `${Array.from({ length: 5000 }, () => filler).join('\n')}\n${assistant(text('Final del archivo grande'))}\n`);
    expect(readAgentReply(big, [claude])).toBe('Final del archivo grande');
  });
});
