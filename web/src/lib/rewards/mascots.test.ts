import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { faceOf, mascotById, MASCOTS, moodOf, MOOD_LINES, stripFor, type MoodInput, type Strip } from './mascots';

const base: MoodInput = { celebrating: false, trouble: false, agentsRunning: 0, workday: 'during', weekend: false, commitsToday: 0 };

describe('mascotas', () => {
  it('hay varias para elegir, con ids únicos, y una que no existe cae en la primera', () => {
    expect(MASCOTS.length).toBeGreaterThanOrEqual(17);
    expect(new Set(MASCOTS.map((m) => m.id)).size).toBe(MASCOTS.length);
    expect(mascotById('inventada').id).toBe(MASCOTS[0]!.id);
    expect(MASCOTS.find((m) => m.id === 'gato')!.sprite).toBeUndefined();
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

describe('sprites', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const png = (src: string) => join(here, '../../../public', src);
  const widthOf = (file: string): number => readFileSync(file).readUInt32BE(16);
  const sprites = MASCOTS.filter((m) => m.sprite);

  it('hay mascotas con sprite y mascotas con emoji (de las dos clases, para elegir)', () => {
    expect(sprites.length).toBeGreaterThanOrEqual(7);
    expect(MASCOTS.length - sprites.length).toBeGreaterThanOrEqual(10);
  });
  it('cada tira existe y mide exactamente cuadros × ancho del cuadro (así la animación no se desfasa)', () => {
    for (const mascot of sprites) {
      const { sprite } = mascot;
      for (const [name, strip] of Object.entries(sprite!).filter(([, v]) => typeof v === 'object' && v !== null && 'src' in (v as object)) as Array<[string, Strip]>) {
        const file = png(strip.src);
        expect(existsSync(file), `${mascot.id}/${name}`).toBe(true);
        expect(widthOf(file), `${mascot.id}/${name}`).toBe(strip.frames * sprite!.frameW);
      }
    }
  });
  it('cada ánimo elige una tira: lo que no tiene propia usa otra, y dormida queda congelada', () => {
    const fox = mascotById('zorro-pixel').sprite!;
    expect(stripFor(fox, 'work').strip.src).toContain('/run');
    expect(stripFor(fox, 'party').strip.src).toContain('/run');
    expect(stripFor(fox, 'happy').strip.src).toContain('/walk');
    expect(stripFor(fox, 'sleep').frozen).toBe(true);
    expect(stripFor(fox, 'tired').speed).toBeLessThan(1);
    const cat = mascotById('gatito').sprite!;
    expect(stripFor(cat, 'party').strip.src).toContain('/party');
    expect(stripFor(cat, 'worried').strip.src).toContain('/worried');
    expect(stripFor(cat, 'sleep').strip.src).toContain('/sleep');
    expect(stripFor(mascotById('lobo').sprite!, 'party').strip.src).toContain('/howl');
  });
  it('los créditos de los packs están en el repo', () => {
    expect(readFileSync(png('/mascots/CREDITS.md'), 'utf8')).toContain('CC0');
  });
});
