import { describe, expect, it } from 'vitest';
import { cleanBlock, MAX_CONTENT, REDACTED, redactSecrets } from './redact.js';

// Todos los "secretos" de este archivo son inventados (rellenos con caracteres repetidos): no hay ninguna credencial real.
const FAKE = 'ZZ99'.repeat(9);

describe('redactSecrets', () => {
  it.each([
    ['token de GitHub', `ghp_${FAKE}`],
    ['token fino de GitHub', `github_pat_${FAKE}${FAKE}`],
    ['token de GitLab', `glpat-${FAKE}`],
    ['clave de Anthropic', `sk-ant-${FAKE}`],
    ['clave estilo OpenAI', `sk-${FAKE}`],
    ['clave de AWS', 'AKIAZZZZZZZZZZZZZZZZ'],
    ['token de Slack', `xoxb-${FAKE}`],
    ['JWT', `eyJ${FAKE}.eyJ${FAKE}.${FAKE}`],
    ['Bearer', `Authorization: Bearer ${FAKE}`],
  ])('tapa %s', (_name, secret) => {
    const out = redactSecrets(`antes ${secret} después`);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain('ZZ99');
    expect(out).not.toContain('AKIAZZZZ');
    expect(out).toContain('antes');
    expect(out).toContain('después');
  });

  it('tapa el valor de "clave = valor" y similares, y deja el nombre', () => {
    expect(redactSecrets('password=ValorInventado1')).toBe(`password=${REDACTED}`);
    expect(redactSecrets('PIN: 000000')).toBe(`PIN: ${REDACTED}`);
    expect(redactSecrets('api_key = "valorinventado"')).toBe(`api_key = "${REDACTED}"`);
    expect(redactSecrets('"token": "valor-inventado-1"')).toBe(`"token": "${REDACTED}"`);
    expect(redactSecrets('contraseña: ValorInventado2')).toBe(`contraseña: ${REDACTED}`);
    expect(redactSecrets('SERVICE_TOKEN=valorinventado')).toBe(`SERVICE_TOKEN=${REDACTED}`);
  });

  it('tapa las credenciales dentro de una URL y conserva el resto', () => {
    expect(redactSecrets('git clone https://usuario:valorinventado@git.ejemplo.com/repo.git')).toBe(`git clone https://usuario:${REDACTED}@git.ejemplo.com/repo.git`);
  });

  it('tapa un bloque de clave privada completo', () => {
    const out = redactSecrets('antes\n-----BEGIN RSA PRIVATE KEY-----\nCONTENIDO-INVENTADO\nabc\n-----END RSA PRIVATE KEY-----\ndespués');
    expect(out).not.toContain('CONTENIDO-INVENTADO');
    expect(out).toContain('antes');
    expect(out).toContain('después');
  });

  it('no toca el texto normal: rutas, SHAs de git, números y frases', () => {
    const text = 'Leí /root/projects/front/src/app.ts, el commit 3760a49 y 82 archivos. El ticket 33527 sigue en pruebas.';
    expect(redactSecrets(text)).toBe(text);
    expect(redactSecrets('El token expiró ayer')).toBe('El token expiró ayer');
  });
});

describe('cleanBlock', () => {
  it('conserva los saltos de línea, quita caracteres de control y tapa secretos', () => {
    expect(cleanBlock('línea 1\r\nlínea 2\u0007\n\ttab password=ValorInventado1')).toBe(`línea 1\nlínea 2\n\ttab password=${REDACTED}`);
  });
  it('lo que no es texto o está vacío da null', () => {
    expect(cleanBlock(undefined)).toBeNull();
    expect(cleanBlock(42)).toBeNull();
    expect(cleanBlock('   \n ')).toBeNull();
  });
  it('recorta lo muy largo y lo avisa', () => {
    const out = cleanBlock('a'.repeat(MAX_CONTENT + 500))!;
    expect(out.length).toBeLessThan(MAX_CONTENT + 30);
    expect(out.endsWith('…[recortado]')).toBe(true);
    expect(cleanBlock('a'.repeat(MAX_CONTENT))).toHaveLength(MAX_CONTENT);
  });
});
