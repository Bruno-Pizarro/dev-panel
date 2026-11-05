import { describe, expect, it } from 'vitest';
import { uniqueById } from './uniqueById';

describe('uniqueById', () => {
  it('deja el primero de cada id y conserva el orden', () => {
    expect(uniqueById([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'a', n: 3 }])).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
  });
});
