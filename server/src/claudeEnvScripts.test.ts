import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sin tipos
import { check } from '../scripts/claude-env-guard.mjs';
// @ts-expect-error módulo .mjs sin tipos
import { apply, DENY } from '../scripts/install-claude-env-guards.mjs';

describe('claude-env-guard', () => {
  it('frena leer el archivo, imprimir el entorno y mostrar variables secretas', () => {
    for (const command of [
      'cat ~/.config/dev-panel/claude.env',
      'grep TOKEN /home/dev/.config/dev-panel/claude.env',
      'printenv',
      'env',
      'env | grep TOKEN',
      'set',
      'export -p',
      'cat /proc/self/environ',
      'echo $GITLAB_RW_TOKEN',
      'echo "${GITHUB_TOKEN}"',
      'git status && printenv',
      'dpx run -- true; printenv',
    ]) expect(check(command), command).toBeTypeOf('string');
  });

  it('deja pasar lo normal y todo lo que va por dpx', () => {
    for (const command of [
      'git status',
      'env FOO=1 node app.js',
      'echo hola',
      'export FOO=1',
      'dpx run -- printenv GITLAB_RW_TOKEN',
      'dpx run -- sh -c \'curl -H "PRIVATE-TOKEN: $GITLAB_RW_TOKEN" https://x\'',
      'dpx names',
      'dpx gitlab-mr create --repo legajo --source feature/1 --title t',
    ]) expect(check(command), command).toBeNull();
    expect(check(undefined)).toBeNull();
  });

  it('dpx tampoco puede apuntar al archivo', () => {
    expect(check('dpx run -- cat ~/.config/dev-panel/claude.env')).toBeTypeOf('string');
  });
});

describe('install-claude-env-guards', () => {
  const existing = { model: 'x', permissions: { deny: ['Read(.env)'], allow: ['Bash(git:*)'] }, hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: 'otro.sh' }] }] } };

  it('suma deny y hook sin tocar lo que había, y es idempotente', () => {
    const next = apply(existing, false, '/x/claude-env-guard.mjs');
    expect(next.permissions.deny).toEqual(['Read(.env)', ...DENY]);
    expect(next.permissions.allow).toEqual(['Bash(git:*)']);
    expect(next.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(next.hooks.PreToolUse[1]).toMatchObject({ matcher: 'Bash' });
    expect(apply(next, false, '/x/claude-env-guard.mjs')).toEqual(next);
    expect(JSON.stringify(existing)).not.toContain('claude-env-guard');
  });

  it('--remove deja el archivo como estaba', () => {
    expect(apply(apply(existing, false), true)).toEqual(existing);
    expect(apply({ model: 'x' }, true)).toEqual({ model: 'x' });
  });
});
