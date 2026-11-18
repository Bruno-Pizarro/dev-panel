import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import { activeRules, countUsers, DEFAULT_CRITICAL_RULES, diffRows, evaluateFile, isTestFile, readLocalCritical, readMrCritical, reviewPoints } from './criticalChanges.js';
import { clearMrChangesCache } from './mrChanges.js';
import type { Fetcher } from './gitlab.js';
import type { TicketMeta } from './tickets.js';

const diffOf = (...added: string[]): string => `@@ -10,1 +10,${added.length + 1} @@\n ctx\n${added.map((line) => `+${line}`).join('\n')}\n`;
const rules = DEFAULT_CRITICAL_RULES;
const ids = (points: ReturnType<typeof evaluateFile>) => points.map((point) => point.ruleId);

describe('diffRows', () => {
  it('numera las líneas agregadas con la numeración nueva y ubica las quitadas', () => {
    const rows = diffRows('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -5,3 +5,3 @@\n a\n-viejo\n+nuevo\n b\n');
    expect(rows).toEqual([{ kind: 'del', next: 6, text: 'viejo' }, { kind: 'add', next: 6, text: 'nuevo' }]);
  });
});

describe('reglas por línea', () => {
  it('marca la línea exacta (número del archivo nuevo) de una ruta sin permiso', () => {
    const points = evaluateFile(rules, 'legajo', 'committed', 'src/modules/x/x.route.ts', diffOf(".route('/:id/nueva-version').post(auth(), validate(v), ctrl.nueva);"));
    expect(points).toMatchObject([{ ruleId: 'permisos-auth-ruta', line: 11, category: 'permisos', source: 'regla' }]);
    expect(points[0]!.snippet).toContain('auth()');
  });

  it('una RegExp con un valor sin escapar es crítica; con escapeRegex o literal, no', () => {
    expect(ids(evaluateFile(rules, 'legajo', 'committed', 'src/a.ts', diffOf('const re = new RegExp(search, "i");')))).toContain('inyeccion-regexp');
    expect(evaluateFile(rules, 'legajo', 'committed', 'src/a.ts', diffOf('const re = new RegExp(escapeRegex(search), "i");'))).toEqual([]);
    expect(evaluateFile(rules, 'legajo', 'committed', 'src/a.ts', diffOf("const re = new RegExp('^abc', 'i');"))).toEqual([]);
  });

  it('detecta borrados masivos, índices y agregaciones', () => {
    const found = ids(evaluateFile(rules, 'legajo', 'committed', 'src/s.ts', diffOf('await Model.deleteMany({});', 'schema.index({ legajo: 1 });', 'Model.aggregate([{ $lookup: {} }]);')));
    expect(found).toEqual(expect.arrayContaining(['borrados-masivos', 'bd-indices', 'rend-agregacion']));
  });

  it('una ruta con permiso no se marca; sin permiso (auth()) sí', () => {
    expect(evaluateFile(rules, 'legajo', 'committed', 'src/modules/x/x.route.ts', diffOf(".get(auth('getX'), ctrl.get)"))).toEqual([]);
    expect(ids(evaluateFile(rules, 'legajo', 'committed', 'src/modules/x/x.route.ts', diffOf('.get(auth(), ctrl.get)')))).toEqual(['permisos-auth-ruta']);
  });

  it('un README no se evalúa aunque esté en una carpeta de clientes', () => {
    expect(evaluateFile(rules, 'legajo', 'committed', 'src/clients/README.md', null)).toEqual([]);
  });

  it('una línea quitada de auth() se marca en el lugar donde estaba', () => {
    const points = evaluateFile(rules, 'legajo', 'committed', 'src/modules/x/x.route.ts', '@@ -3,2 +3,1 @@\n-  .get(auth("getX"), ctrl.get)\n+  .get(ctrl.get)\n');
    expect(points).toMatchObject([{ ruleId: 'permisos-auth-ruta', line: 3 }]);
    expect(points[0]!.reason).toMatch(/Se quitó o cambió/);
  });

  it('el motor de liquidación solo aplica en el repo liquidacion', () => {
    const line = diffOf('const total = actualizarAcumuladores(x);');
    expect(ids(evaluateFile(rules, 'liquidacion', 'committed', 'src/modules/calculoLiq/calculoLiq.business.ts', line))).toEqual(expect.arrayContaining(['liquidacion-motor', 'liquidacion-lineas']));
    expect(ids(evaluateFile(rules, 'legajo', 'committed', 'src/modules/calculoLiq/calculoLiq.business.ts', line)).filter((id) => id.startsWith('liquidacion'))).toEqual([]);
  });

  it('limita los puntos repetidos de una misma regla en un archivo', () => {
    const many = Array.from({ length: 30 }, (_, i) => `x${i}.toFixed(2);`);
    expect(evaluateFile(rules, 'legajo', 'committed', 'src/a.ts', diffOf(...many)).length).toBe(8);
  });
});

describe('reglas por archivo', () => {
  it('marca el archivo entero: roles, modelos, infra, guards, scripts y .env', () => {
    const cases: Array<[string, string]> = [
      ['src/config/roles.ts', 'permisos-roles'],
      ['src/modules/user/user.model.ts', 'modelos-esquema'],
      ['docker-compose.yml', 'infra-archivos'],
      ['src/app/core/auth/guards/ddjj.guard.ts', 'guards-front'],
      ['src/scripts/moraCandidates.mongo.js', 'bd-scripts'],
      ['.env', 'sensibles-env'],
      ['src/modules/panel/user.validation.ts', 'contratos-validacion'],
    ];
    for (const [path, rule] of cases) {
      const points = evaluateFile(rules, 'panel', 'committed', path, null);
      expect(ids(points), path).toContain(rule);
      expect(points.find((point) => point.ruleId === rule)!.line).toBeNull();
    }
    expect(ids(evaluateFile(rules, 'panel', 'committed', '.env.example', null))).not.toContain('sensibles-env');
  });

  it('los archivos de pruebas no cuentan', () => {
    expect(isTestFile('src/a.spec.ts')).toBe(true);
    expect(evaluateFile(rules, 'legajo', 'committed', 'src/modules/user/user.model.spec.ts', diffOf('deleteMany({})'))).toEqual([]);
  });
});

describe('reglas propias y apagadas', () => {
  it('se apagan por id y se suman las propias', () => {
    const config = defaultConfig('/x');
    config.changes.critical.disabledRules = ['dinero-fechas'];
    config.changes.critical.customRules = [{ id: 'mia', category: 'seguridad', severity: 'alta', reason: 'Mi regla', lines: ['PELIGRO'] }];
    const active = activeRules(config);
    expect(active.some((rule) => rule.id === 'dinero-fechas')).toBe(false);
    expect(ids(evaluateFile(active, 'x', 'committed', 'a.ts', diffOf('// PELIGRO aca')))).toEqual(['mia']);
  });

  it('una expresión inválida no rompe el análisis', () => {
    const active = [{ id: 'mala', category: 'seguridad' as const, severity: 'alta' as const, reason: 'x', lines: ['(sin cerrar'] }];
    expect(evaluateFile(active, 'x', 'committed', 'a.ts', diffOf('algo'))).toEqual([]);
  });
});

describe('puntos que deja una revisión', () => {
  it('se leen de cambiosCriticos con línea o rango, y la categoría desconocida cae en «revisión»', () => {
    const meta = { cambiosCriticos: [{ repo: 'legajo', path: 'src/a.ts', lineas: '120-135', motivo: 'Cambia el desbloqueo al firmar', severidad: 'alta', categoria: 'permisos' }, { path: 'src/b.ts', linea: 7, motivo: 'Otro', categoria: 'inventada' }, { path: 'x', motivo: '' }] } as unknown as TicketMeta;
    expect(reviewPoints(meta)).toMatchObject([
      { repo: 'legajo', path: 'src/a.ts', line: 120, endLine: 135, severity: 'alta', category: 'permisos', source: 'revision' },
      { path: 'src/b.ts', line: 7, severity: 'critica', category: 'revision', source: 'revision' },
    ]);
    expect(reviewPoints(null)).toEqual([]);
  });
});

describe('con un repo git real', () => {
  const projects = mkdtempSync(join(tmpdir(), 'dp-critical-'));
  const repoDir = join(projects, 'front');
  const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  mkdirSync(join(repoDir, 'src/shared'), { recursive: true });
  git('init', '-q', '-b', 'desarrollo');
  writeFileSync(join(repoDir, 'src/shared/util.ts'), 'export const a = 1;\n');
  writeFileSync(join(repoDir, 'src/shared/select.component.ts'), "@Component({ selector: 'app-select-x' }) export class S {}\n");
  for (let i = 0; i < 11; i++) {
    writeFileSync(join(repoDir, `src/uso${i}.ts`), `import { a } from './shared/util';\nexport const u${i} = a;\n`);
    writeFileSync(join(repoDir, `src/vista${i}.html`), '<app-select-x></app-select-x>\n');
  }
  writeFileSync(join(repoDir, 'src/poco.ts'), "import { a } from './shared/util';\n");
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature/1-x');
  writeFileSync(join(repoDir, 'src/shared/util.ts'), 'export const a = 2;\n');
  writeFileSync(join(repoDir, 'src/shared/select.component.ts'), "@Component({ selector: 'app-select-x' }) export class S { x = 1; }\n");
  writeFileSync(join(repoDir, 'src/uso0.ts'), "import { a } from './shared/util';\nexport const u0 = new RegExp(a, 'i');\n");
  git('add', '.');
  git('commit', '-q', '-m', 'cambio');
  const config = defaultConfig(projects) as unknown as DevPanelConfig;

  it('cuenta cuántos archivos usan uno (por importación y por selector de plantilla)', async () => {
    expect(await countUsers(repoDir, 'src/shared/util.ts')).toBe(12);
    expect(await countUsers(repoDir, 'src/shared/select.component.ts')).toBe(11);
    expect(await countUsers(repoDir, 'src/poco.ts')).toBe(0);
  });

  it('el informe suma las reglas, «usado en muchos lugares» y lo que dejó la revisión', async () => {
    const meta = { repos: ['front'], cambiosCriticos: [{ repo: 'front', path: 'src/uso0.ts', linea: 2, motivo: 'Mirar este uso', categoria: 'seguridad' }] } as unknown as TicketMeta;
    const report = await readLocalCritical(config, meta);
    expect(report.enabled).toBe(true);
    expect(report.analyzed).toBe(3);
    const byRule = (id: string) => report.points.filter((point) => point.ruleId === id);
    expect(byRule('compartido-usos').map((point) => point.path).sort()).toEqual(['src/shared/select.component.ts', 'src/shared/util.ts']);
    expect(byRule('inyeccion-regexp')).toMatchObject([{ path: 'src/uso0.ts', line: 2 }]);
    expect(byRule('revision')).toMatchObject([{ path: 'src/uso0.ts', line: 2, source: 'revision' }]);
  });

  it('apagado, no analiza nada', async () => {
    const off = defaultConfig(projects) as unknown as DevPanelConfig;
    off.changes.critical.enabled = false;
    expect(await readLocalCritical(off, { repos: ['front'] } as unknown as TicketMeta)).toMatchObject({ enabled: false, points: [], analyzed: 0 });
  });
});

describe('MRs de GitLab', () => {
  it('analiza los diffs de cada MR y deja en el punto la etiqueta «repo !iid»', async () => {
    clearMrChangesCache();
    const raw = { source_branch: 'feature/x', target_branch: 'desarrollo', changes: [
      { old_path: 'src/s.ts', new_path: 'src/s.ts', diff: '@@ -3,1 +3,2 @@\n igual\n+await Model.deleteMany({});\n' },
      { old_path: 'src/config/roles.ts', new_path: 'src/config/roles.ts', diff: '@@ -1,1 +1,1 @@\n-a\n+b\n' },
    ] };
    const fetcher: Fetcher = async () => ({ ok: true, status: 200, json: async () => raw });
    const config = { ...defaultConfig('/no-existe'), gitlab: { enabled: true, baseUrl: 'https://git.example.com', group: 'grupo', token: 'tk-inventado', sshAuto: false } } as unknown as DevPanelConfig;
    const meta = { ticket: '1', mrs: [{ repo: 'legajo', iid: 3 }], cambiosCriticos: [{ repo: 'legajo', path: 'src/s.ts', linea: 4, motivo: 'Mirar', categoria: 'seguridad' }] } as unknown as TicketMeta;
    const report = await readMrCritical(config, meta, {}, undefined, { fetcher });
    expect(report.analyzed).toBe(2);
    expect(report.points.find((point) => point.ruleId === 'borrados-masivos')).toMatchObject({ repo: 'legajo !3', path: 'src/s.ts', line: 4 });
    expect(report.points.find((point) => point.ruleId === 'permisos-roles')).toMatchObject({ repo: 'legajo !3', line: null });
    expect(report.points.find((point) => point.source === 'revision')).toMatchObject({ repo: 'legajo', path: 'src/s.ts', line: 4 });
  });
});
