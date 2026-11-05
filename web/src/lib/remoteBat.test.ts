import { describe, expect, it } from 'vitest';
import { buildBat, validTarget } from './remoteBat';

describe('.bat de acceso remoto', () => {
  it('reenvía cada puerto, abre el front y el panel, y usa saltos de línea de Windows', () => {
    const bat = buildBat('192.168.1.94', 'pizar', [3007, 4200, 5173]);
    expect(bat).toContain('ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=no -L 3007:localhost:3007 -L 4200:localhost:4200 -L 5173:localhost:5173 pizar@192.168.1.94');
    expect(bat).toContain('cmd /c "timeout /t 4 >nul & start http://localhost:4200 & start http://localhost:5173"');
    expect(bat.split('\r\n').length).toBeGreaterThan(5);
    expect(bat).not.toMatch(/[^\r]\n/);
  });
  it('rechaza hosts y usuarios con caracteres de cmd', () => {
    for (const [host, user] of [['a&calc', 'u'], ['h', 'u|v'], ['', 'u'], ['h', ''], ['h h', 'u'], ['h', 'u"x']]) {
      expect(validTarget(host!, user!)).toBe(false);
      expect(() => buildBat(host!, user!, [1])).toThrow();
    }
    expect(validTarget('mi-notebook.local', 'pizar')).toBe(true);
  });
});
