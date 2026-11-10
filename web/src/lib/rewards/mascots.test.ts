import { describe, expect, it } from 'vitest';
import { faceOf, mascotById, MASCOTS, moodOf, MOOD_LINES, type MoodInput } from './mascots';

const base: MoodInput = { celebrating: false, trouble: false, agentsRunning: 0, workday: 'during', weekend: false, commitsToday: 0 };

describe('mascotas', () => {
  it('hay varias para elegir, con ids únicos, y una que no existe cae en la primera', () => {
    expect(MASCOTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(MASCOTS.map((m) => m.id)).size).toBe(MASCOTS.length);
    expect(mascotById('inventada').id).toBe(MASCOTS[0]!.id);
    expect(mascotById('mate').emoji).toBe('🧉');
  });
  it('un gato cambia de cara según el ánimo; el robot usa siempre la misma', () => {
    expect(faceOf(mascotById('gato'), 'worried')).toBe('🙀');
    expect(faceOf(mascotById('robot'), 'worried')).toBe('🤖');
  });
  it('todos los ánimos tienen frases', () => {
    for (const lines of Object.values(MOOD_LINES)) expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ánimo', () => {
  it('manda la fiesta, después el problema, el trabajo, el cansancio, el sueño y la alegría', () => {
    expect(moodOf({ ...base, celebrating: true, trouble: true, agentsRunning: 2 })).toBe('party');
    expect(moodOf({ ...base, trouble: true, agentsRunning: 2 })).toBe('worried');
    expect(moodOf({ ...base, agentsRunning: 2, workday: 'after' })).toBe('work');
    expect(moodOf({ ...base, workday: 'after' })).toBe('tired');
    expect(moodOf({ ...base, workday: 'before' })).toBe('sleep');
    expect(moodOf({ ...base, weekend: true })).toBe('sleep');
    expect(moodOf({ ...base, commitsToday: 4 })).toBe('happy');
    expect(moodOf(base)).toBe('idle');
  });
});
