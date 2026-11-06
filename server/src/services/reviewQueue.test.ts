import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';
import { extractMrs, isUnclaimed, lastComments, qaIsForMe, reviewerCommentCount, reviewPrompt, slugify, type ReviewQueueItem } from './reviewQueue.js';

describe('cola de revisión: piezas puras', () => {
  it('extractMrs saca los enlaces de MR sin repetir y con repo e iid', () => {
    const mrs = extractMrs(['Ver "!6":http://git.icono-cloud.com/e-sueldos-v3/firma/-/merge_requests/6 y otra vez http://git.icono-cloud.com/e-sueldos-v3/firma/-/merge_requests/6.', 'https://git.icono-cloud.com/e-sueldos-v3/legajo/-/merge_requests/70)']);
    expect(mrs).toEqual([
      { url: 'http://git.icono-cloud.com/e-sueldos-v3/firma/-/merge_requests/6', repo: 'firma', iid: 6 },
      { url: 'https://git.icono-cloud.com/e-sueldos-v3/legajo/-/merge_requests/70', repo: 'legajo', iid: 70 },
    ]);
    expect(extractMrs(['sin enlaces'])).toEqual([]);
  });

  it('lastComments deja los últimos con texto, en plano y del más viejo al más nuevo', () => {
    const journals = [
      { user: { id: 1, name: 'A' }, created_on: '2026-11-01T10:00:00Z', notes: 'h2. Viejo' },
      { user: { id: 2, name: 'B' }, created_on: '2026-11-02T10:00:00Z', notes: '' },
      { user: { id: 3, name: 'C' }, created_on: '2026-11-03T10:00:00Z', notes: 'Con *énfasis* y @código@' },
    ];
    const comments = lastComments(journals, 5);
    expect(comments.map((comment) => comment.user)).toEqual(['A', 'C']);
    expect(comments[1]!.notes).toBe('Con énfasis y código');
    expect(lastComments(journals, 1).map((comment) => comment.user)).toEqual(['C']);
  });

  it('un QA lo tomó alguien si tiene comentarios de un revisor que no es el autor del QA', () => {
    const journals = [
      { user: { id: 10, name: 'Autor' }, created_on: 'x', notes: 'Plan de pruebas completado' },
      { user: { id: 20, name: 'Revisor' }, created_on: 'x', notes: 'Empiezo la revisión' },
      { user: { id: 30, name: 'Otro rol' }, created_on: 'x', notes: 'comentario' },
      { user: { id: 20, name: 'Revisor' }, created_on: 'x', notes: '   ' },
    ];
    const reviewers = new Set([10, 20]);
    expect(reviewerCommentCount(journals, reviewers, 10)).toBe(1);
    expect(reviewerCommentCount(journals.slice(0, 1), reviewers, 10)).toBe(0);
    expect(reviewerCommentCount(journals, new Set([30]), 10)).toBe(1);
  });

  it('el QA es para mí si no tiene asignado, es mío o es del usuario Backlog e-sueldos; de otra persona, no', () => {
    expect(qaIsForMe(null, 1, 'Backlog e-sueldos')).toBe(true);
    expect(qaIsForMe({ id: 1, name: 'Bruno Pizarro' }, 1, 'Backlog e-sueldos')).toBe(true);
    expect(qaIsForMe({ id: 8, name: 'Backlog e-Sueldos' }, 1, 'Backlog e-sueldos')).toBe(true);
    expect(qaIsForMe({ id: 5, name: 'Alvaro Blanco' }, 1, 'Backlog e-sueldos')).toBe(false);
    expect(qaIsForMe({ id: 5, name: 'Alvaro Blanco' }, null, 'Backlog e-sueldos')).toBe(false);
  });

  it('sin revisores comentando está sin tomar; si los roles no se pudieron leer no se descarta a nadie', () => {
    expect(isUnclaimed(0, true)).toBe(true);
    expect(isUnclaimed(2, true)).toBe(false);
    expect(isUnclaimed(2, false)).toBe(true);
  });

  it('slugify saca tildes y símbolos y limita el largo', () => {
    expect(slugify('Pestaña "Pendientes de firma" en el Perfil (Legajo)')).toBe('pestana-pendientes-de-firma-en-el-perfil-legajo');
    expect(slugify('¡¡!!')).toBe('ticket');
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(50);
  });

  it('el pedido para Claude trae el ticket, el QA, la carpeta, los MRs y los pasos', () => {
    const item: ReviewQueueItem = { id: 33380, url: 'https://r/issues/33380', title: 'Medio día', tracker: 'Nueva funcionalidad', status: 'Revisión', assignedTo: 'Alvaro Blanco', storyPoints: 5, description: '', comments: [], qa: { id: 33588, url: 'https://r/issues/33588', status: 'Nueva', assignedTo: 'X', author: 'Y', description: '', comments: [], reviewerComments: 0 }, mrs: [{ url: 'https://g/legajo/-/merge_requests/61', repo: 'legajo', iid: 61 }], folder: null };
    const prompt = reviewPrompt(item, '33380-medio-dia');
    expect(prompt).toContain('#33380 «Medio día»');
    expect(prompt).toContain('https://r/issues/33588');
    expect(prompt).toContain('_EXTRA/33380-medio-dia');
    expect(prompt).toContain('legajo !61');
    expect(prompt).toContain('mr_changes');
    expect(prompt).toContain('No mergees ni cierres nada');
    expect(reviewPrompt({ ...item, mrs: [], qa: null }, 'd')).toContain('no tiene subtarea de QA');
  });
});

describe('cola de revisión: Redmine simulado y carpeta local', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp-review-'));
  const extra = join(dir, 'extra');
  let queue: typeof import('./reviewQueue.js');
  let config: DevPanelConfig;
  beforeAll(async () => {
    process.env['DEV_PANEL_DATA'] = dir;
    process.env['REDMINE_API_KEY'] = 'clave-inventada';
    mkdirSync(extra, { recursive: true });
    queue = await import('./reviewQueue.js');
    const { defaultConfig } = await import('../config.js');
    config = defaultConfig('/tmp/x') as DevPanelConfig;
    config.redmine.baseUrl = 'https://r.example';
    config.paths.extra = extra;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const issue = (id: number, subject: string, status: string, assigned: { id: number; name: string }, tracker = 'Nueva funcionalidad') => ({ id, subject, status: { name: status }, tracker: { name: tracker }, assigned_to: assigned, project: { id: 262, name: 'TRIUNFO - RRHH' }, updated_on: '2026-11-04T09:00:00Z' });
  const fake = (async (url: string) => {
    const path = url.replace('https://r.example', '');
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (path.startsWith('/users/current')) return json({ user: { id: 1 } });
    if (path.startsWith('/issues.json?tracker_id=22')) return json({ issues: [{ id: 33677, subject: 'Sprint Semana 02/11/26 al 06/11/26' }] });
    if (path === '/issues/33677.json?include=relations') return json({ issue: { relations: [{ issue_id: 33677, issue_to_id: 100 }, { issue_id: 33677, issue_to_id: 200 }, { issue_id: 33677, issue_to_id: 300 }, { issue_id: 33677, issue_to_id: 400 }, { issue_id: 33677, issue_to_id: 500 }, { issue_id: 33677, issue_to_id: 600 }, { issue_id: 33677, issue_to_id: 700 }] } });
    if (path.startsWith('/issues.json?issue_id=') && path.includes('assigned_to_id=me')) return json({ issues: [] });
    if (path.startsWith('/issues.json?issue_id=')) {
      return json({ issues: [issue(100, '[5 SP] Libre para revisar', 'Revisión', { id: 5, name: 'Alvaro Blanco' }), issue(200, '[3 SP] Ya tomado', 'Revisión', { id: 5, name: 'Alvaro Blanco' }), issue(300, '[2 SP] Mío', 'Revisión', { id: 1, name: 'Bruno Pizarro' }), issue(400, '[8 SP] En desarrollo', 'Desarrollo', { id: 6, name: 'Otro' }), issue(500, '[1 SP] QA de otro', 'Revisión', { id: 5, name: 'Alvaro Blanco' }), issue(600, '[2 SP] QA mío', 'Revisión', { id: 5, name: 'Alvaro Blanco' }), issue(700, '[4 SP] Sin QA', 'Revisión', { id: 6, name: 'Otro' })] });
    }
    if (path.startsWith('/projects/262/memberships')) return json({ memberships: [{ user: { id: 5 }, roles: [{ name: 'Desarrollador' }] }, { user: { id: 7 }, roles: [{ name: 'Desarrollador' }] }, { user: { id: 9 }, roles: [{ name: 'Gerente' }] }] });
    if (path.startsWith('/issues/100.json')) return json({ issue: { id: 100, description: 'Descripción con !MR http://g/e-sueldos-v3/legajo/-/merge_requests/61', journals: [{ user: { id: 5, name: 'Alvaro Blanco' }, created_on: '2026-11-03T10:00:00Z', notes: 'Listo para revisar' }], children: [{ id: 101, tracker: { name: 'Control QA' } }] } });
    if (path.startsWith('/issues/101.json')) return json({ issue: { id: 101, status: { name: 'Nueva' }, author: { id: 5, name: 'Alvaro Blanco' }, assigned_to: { id: 8, name: 'Backlog e-sueldos' }, description: 'h2. Plan de pruebas', journals: [{ user: { id: 5, name: 'Alvaro Blanco' }, created_on: '2026-11-03T11:00:00Z', notes: 'Plan completo' }] } });
    if (path.startsWith('/issues/200.json')) return json({ issue: { id: 200, description: '', journals: [], children: [{ id: 201, tracker: { name: 'Control QA' } }] } });
    if (path.startsWith('/issues/201.json')) return json({ issue: { id: 201, status: { name: 'En progreso' }, author: { id: 5, name: 'Alvaro Blanco' }, journals: [{ user: { id: 7, name: 'Luana Trevisan' }, created_on: '2026-11-04T09:00:00Z', notes: 'Estoy revisándolo' }] } });
    if (path.startsWith('/issues/500.json')) return json({ issue: { id: 500, description: '', journals: [], children: [{ id: 501, tracker: { name: 'Control QA' } }] } });
    if (path.startsWith('/issues/501.json')) return json({ issue: { id: 501, status: { name: 'Nueva' }, author: { id: 5, name: 'Alvaro Blanco' }, assigned_to: { id: 7, name: 'Luana Trevisan' }, description: '', journals: [] } });
    if (path.startsWith('/issues/600.json')) return json({ issue: { id: 600, description: '', journals: [], children: [{ id: 601, tracker: { name: 'Control QA' } }] } });
    if (path.startsWith('/issues/601.json')) return json({ issue: { id: 601, status: { name: 'Nueva' }, author: { id: 5, name: 'Alvaro Blanco' }, assigned_to: { id: 1, name: 'Bruno Pizarro' }, description: '', journals: [] } });
    if (path.startsWith('/issues/700.json')) return json({ issue: { id: 700, description: '', journals: [], children: [] } });
    return { ok: false, status: 404, json: async () => ({}) };
  }) as never;
  const noon = new Date(2026, 10, 4, 12, 0);

  it('lista los de Revisión del sprint que no son míos: sin QA, o con el QA asignado a mí o a Backlog e-sueldos y sin comentarios de revisores', async () => {
    const result = await queue.fetchReviewQueue(config, fake, noon, true);
    expect(result.sprint?.id).toBe(33677);
    expect(result.rolesKnown).toBe(true);
    // 200: ya lo toma Luana (comentó); 500: su QA está asignado a otra persona; 300: es mío; 400: no está en Revisión
    expect(result.items.map((item) => item.id)).toEqual([100, 600, 700]);
    expect(result.items.find((item) => item.id === 700)!.qa).toBeNull();
    expect(result.items.find((item) => item.id === 600)!.qa).toMatchObject({ assignedTo: 'Bruno Pizarro' });
    const item = result.items[0]!;
    expect(item).toMatchObject({ title: 'Libre para revisar', storyPoints: 5, assignedTo: 'Alvaro Blanco', folder: null });
    expect(item.qa).toMatchObject({ id: 101, reviewerComments: 0, author: 'Alvaro Blanco' });
    expect(item.mrs).toEqual([{ url: 'http://g/e-sueldos-v3/legajo/-/merge_requests/61', repo: 'legajo', iid: 61 }]);
    expect(item.comments[0]!.notes).toBe('Listo para revisar');
  });

  it('startReview crea la carpeta como revisión, con los MRs, y devuelve el pedido; no pisa lo que ya existe', async () => {
    const started = await queue.startReview(config, 100, fake, noon);
    expect(started).toMatchObject({ dir: '100-libre-para-revisar', created: true, kind: 'revision' });
    expect(started.prompt).toContain('#100');
    const meta = JSON.parse(readFileSync(join(extra, started.dir, 'ticket.json'), 'utf8'));
    expect(meta).toMatchObject({ ticket: '100', tipo: 'revision', titulo: 'Libre para revisar', url: 'https://r.example/issues/100', responsable: 'Alvaro Blanco' });
    expect(meta.mrs).toEqual([{ repo: 'legajo', iid: 61, url: 'http://g/e-sueldos-v3/legajo/-/merge_requests/61', estado: 'abierto' }]);

    // una segunda vez no la vuelve a crear y conserva lo que ya tenía (por ejemplo notas agregadas por Claude)
    writeFileSync(join(extra, started.dir, 'ticket.json'), JSON.stringify({ ...meta, codeReview: [{ fecha: '2026-11-06', veredicto: 'aprobado' }] }));
    const again = await queue.startReview(config, 100, fake, noon);
    expect(again).toMatchObject({ dir: started.dir, created: false, kind: 'revision' });
    expect(JSON.parse(readFileSync(join(extra, started.dir, 'ticket.json'), 'utf8')).codeReview).toHaveLength(1);
    // ahora figura con su carpeta
    expect((await queue.fetchReviewQueue(config, fake, noon)).items[0]!.folder).toBe(started.dir);
  });

  it('un ticket con otro tipo ya marcado (desarrollo) no se cambia a revisión', async () => {
    const folder = join(extra, '100-libre-para-revisar');
    const meta = JSON.parse(readFileSync(join(folder, 'ticket.json'), 'utf8'));
    writeFileSync(join(folder, 'ticket.json'), JSON.stringify({ ...meta, tipo: 'desarrollo' }));
    expect(await queue.startReview(config, 100, fake, noon)).toMatchObject({ kind: 'desarrollo', created: false });
  });

  it('un ticket que no está en la cola da 404 y no crea nada', async () => {
    await expect(queue.startReview(config, 200, fake, noon)).rejects.toMatchObject({ status: 404 });
    expect(existsSync(join(extra, '200-ya-tomado'))).toBe(false);
  });

  it('un ticket.json roto no se pisa', async () => {
    const folder = join(extra, '100-libre-para-revisar');
    writeFileSync(join(folder, 'ticket.json'), '{ no es json');
    await expect(queue.startReview(config, 100, fake, noon)).rejects.toMatchObject({ status: 409 });
    expect(readFileSync(join(folder, 'ticket.json'), 'utf8')).toBe('{ no es json');
  });
});
