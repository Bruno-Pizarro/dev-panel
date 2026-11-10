import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from './achievements';
import { PRAISE } from './praise';
import { commitStreak, RECORDS, updateRecords } from './records';
import { EMPTY_GAME, type RewardFacts } from './types';

const facts = (over: Partial<RewardFacts> = {}): RewardFacts => ({ generatedAt: '2026-11-10T15:00:00Z', day: '2026-11-10', weekday: 2, commits: { today: 0, firstToday: null, lastToday: null, week: 0, byDay: {} }, ticketsToday: [], repos: { dirty: 0, unpushed: 0, onProtectedWithChanges: false }, agents: { today: 0, running: 0, finishedToday: 0, maxParallelToday: 0, tokensToday: 0, tokensWeek: 0, modelsToday: [] }, checklist: { total: 0, done: 0, items: {} }, services: null, workday: { entry: '09:00', exit: '18:00' }, ...over });

describe('catálogo', () => {
  it('hay muchos logros, varios diarios y algunos secretos, con ids únicos', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(ACHIEVEMENTS.filter((a) => a.kind === 'daily').length).toBeGreaterThanOrEqual(15);
    expect(ACHIEVEMENTS.filter((a) => a.secret).length).toBeGreaterThanOrEqual(4);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(Object.keys(ACHIEVEMENT_BY_ID)).toHaveLength(ACHIEVEMENTS.length);
  });
  it('todos tienen nombre, descripción y emoji; ninguno se gana con un día vacío', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name && a.desc && a.emoji).toBeTruthy();
      expect(a.test({ facts: facts(), state: EMPTY_GAME, now: new Date(2026, 10, 10, 15) }), a.id).toBe(false);
    }
  });
  it('hay un buen surtido de elogios', () => {
    expect(PRAISE.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PRAISE).size).toBe(PRAISE.length);
  });
});

describe('condiciones de algunos logros', () => {
  const ctx = (f: RewardFacts, hour = 15, state = EMPTY_GAME) => ({ facts: f, state, now: new Date(2026, 10, 10, hour) });
  const get = (id: string) => ACHIEVEMENT_BY_ID[id]!;
  it('madrugador: commit antes de las 8; noctámbulo: después de las 22', () => {
    expect(get('madrugador').test(ctx(facts({ commits: { today: 2, firstToday: '07:30', lastToday: '10:00', week: 2, byDay: {} } })))).toBe(true);
    expect(get('madrugador').test(ctx(facts({ commits: { today: 2, firstToday: '08:00', lastToday: '10:00', week: 2, byDay: {} } })))).toBe(false);
    expect(get('noctambulo').test(ctx(facts({ commits: { today: 1, firstToday: '22:30', lastToday: '22:30', week: 1, byDay: {} } })))).toBe(true);
  });
  it('escritorio ordenado: solo cerca de la salida y con todo pusheado', () => {
    const f = facts({ commits: { today: 3, firstToday: '09:00', lastToday: '17:00', week: 3, byDay: {} } });
    expect(get('escritorio-ordenado').test(ctx(f, 12))).toBe(false);
    expect(get('escritorio-ordenado').test(ctx(f, 18))).toBe(true);
    expect(get('escritorio-ordenado').test(ctx({ ...f, repos: { dirty: 1, unpushed: 0, onProtectedWithChanges: false } }, 18))).toBe(false);
  });
  it('equipo completo: los tres modelos el mismo día', () => {
    expect(get('tres-modelos').test(ctx(facts({ agents: { ...facts().agents, modelsToday: ['haiku', 'opus', 'sonnet'] } })))).toBe(true);
    expect(get('tres-modelos').test(ctx(facts({ agents: { ...facts().agents, modelsToday: ['opus'] } })))).toBe(false);
  });
  it('secretos: ¿vos dormís? (3 a 5 de la mañana) y todo junto', () => {
    expect(get('a-las-tres').test(ctx(facts({ commits: { today: 1, firstToday: '03:40', lastToday: '03:40', week: 1, byDay: {} } })))).toBe(true);
    const day = facts({ commits: { today: 5, firstToday: '09:00', lastToday: '17:00', week: 5, byDay: {} }, agents: { ...facts().agents, maxParallelToday: 3 }, checklist: { total: 2, done: 2, items: {} } });
    expect(get('todo-junto').test(ctx(day))).toBe(true);
  });
});

describe('racha de commits', () => {
  it('los fines de semana sin commits no la cortan; un día hábil vacío, sí', () => {
    // martes 10 con commit; lunes 9 con; sábado 7 y domingo 8 sin; viernes 6 con; jueves 5 sin → corta
    expect(commitStreak({ '2026-11-10': 1, '2026-11-09': 2, '2026-11-06': 1 }, '2026-11-10')).toBe(3);
    expect(commitStreak({ '2026-11-10': 1, '2026-11-09': 2 }, '2026-11-10')).toBe(2);
    expect(commitStreak({ '2026-11-09': 1, '2026-11-06': 1 }, '2026-11-10')).toBe(2); // hoy todavía sin commits: cuenta desde ayer
  });
});

describe('récords', () => {
  const rec = (key: string) => RECORDS.find((r) => r.key === key)!;
  it('la primera marca fija la base sin festejar; mejorarla después sí', () => {
    const first = updateRecords(EMPTY_GAME, facts({ commits: { today: 4, firstToday: '09:00', lastToday: '10:00', week: 4, byDay: {} } }));
    expect(first.broken).toEqual([]);
    expect(first.records.commitsDay).toEqual({ value: 4, day: '2026-11-10' });
    const state = { ...EMPTY_GAME, records: { commitsDay: { value: 4, day: '2026-11-03' } } };
    const better = updateRecords(state, facts({ commits: { today: 6, firstToday: '09:00', lastToday: '10:00', week: 6, byDay: {} } }));
    expect(better.broken).toEqual([{ key: 'commitsDay', value: 6, previous: 4 }]);
  });
  it('un mismo récord se anuncia una vez por día aunque se siga mejorando', () => {
    const state = { ...EMPTY_GAME, records: { commitsDay: { value: 4, day: '2026-11-03' } } };
    const one = updateRecords(state, facts({ commits: { today: 6, firstToday: '09:00', lastToday: '10:00', week: 6, byDay: {} } }));
    const two = updateRecords({ ...state, records: one.records, today: { ...state.today, recordsAnnounced: one.announced } }, facts({ commits: { today: 7, firstToday: '09:00', lastToday: '11:00', week: 7, byDay: {} } }));
    expect(two.broken).toEqual([]);
    expect(two.records.commitsDay!.value).toBe(7);
  });
  it('por debajo del mínimo no se festeja; el primer commit más temprano gana el que llega antes (desde las 4)', () => {
    const state = { ...EMPTY_GAME, records: { commitsDay: { value: 1, day: '2026-11-03' } } };
    expect(updateRecords(state, facts({ commits: { today: 2, firstToday: '09:00', lastToday: '10:00', week: 2, byDay: {} } })).broken).toEqual([]);
    const early = updateRecords({ ...EMPTY_GAME, records: { earliest: { value: 8 * 60, day: '2026-11-03' } } }, facts({ commits: { today: 1, firstToday: '07:15', lastToday: '07:15', week: 1, byDay: {} } }));
    expect(early.broken).toEqual([{ key: 'earliest', value: 7 * 60 + 15, previous: 8 * 60 }]);
    expect(rec('earliest').value(facts({ commits: { today: 1, firstToday: '02:00', lastToday: '02:00', week: 1, byDay: {} } }))).toBeNull();
  });
});
