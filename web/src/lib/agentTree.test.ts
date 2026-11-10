import { describe, expect, it } from 'vitest';
import { formatDuration } from './agentTree';

describe('formato de duración', () => {
  it('formatDuration: mm:ss y h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(47_000)).toBe('00:47');
    expect(formatDuration(95_000)).toBe('01:35');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
  });
});
