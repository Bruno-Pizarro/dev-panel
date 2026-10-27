import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPickerCommand, listDir } from './fsPicker.js';
import { parseLog, ticketFromBranch } from './gitRepos.js';

describe('selector nativo', () => {
  it('en WSL usa el selector de Windows y pasa los textos por variables, no dentro del script', () => {
    const command = buildPickerCommand('wsl', 'folder', 'C:\\Users\\yo\\x\'; Remove-Item *')!;
    expect(command.file).toBe('powershell.exe');
    expect(command.env).toMatchObject({ DP_KIND: 'folder', DP_INITIAL: "C:\\Users\\yo\\x'; Remove-Item *" });
    expect(command.args.join(' ')).not.toContain('Remove-Item');
  });

  it('macOS y Linux usan osascript y zenity', () => {
    expect(buildPickerCommand('darwin', 'file', null)!.file).toBe('osascript');
    const linux = buildPickerCommand('linux', 'folder', '/home/yo')!;
    expect(linux).toMatchObject({ file: 'zenity' });
    expect(linux.args).toContain('--directory');
  });
});

describe('explorador propio', () => {
  const root = mkdtempSync(join(tmpdir(), 'dp-fs-'));
  mkdirSync(join(root, 'b-carpeta'));
  mkdirSync(join(root, 'a-carpeta'));
  mkdirSync(join(root, '.oculta'));
  writeFileSync(join(root, 'compose.yml'), 'x');
  symlinkSync(join(root, 'a-carpeta'), join(root, 'enlace'));

  it('lista carpetas primero, sin ocultas ni archivos, y sigue enlaces a carpetas', () => {
    const listing = listDir(root, false);
    expect(listing.entries.map((entry) => entry.name)).toEqual(['a-carpeta', 'b-carpeta', 'enlace']);
    expect(listing.parent).not.toBeNull();
  });

  it('con archivos incluye los nombres, y una ruta inexistente falla', () => {
    expect(listDir(root, true).entries.map((entry) => entry.name)).toContain('compose.yml');
    expect(() => listDir(join(root, 'no-existe'), false)).toThrow(/no existe/);
    expect(() => listDir(join(root, 'compose.yml'), false)).toThrow(/no existe/);
  });
});

describe('git extra', () => {
  it('deduce el ticket de la rama y lee el log con autor', () => {
    expect(ticketFromBranch('feature/33526-pendientes-firma')).toBe('33526');
    expect(ticketFromBranch('desarrollo')).toBeNull();
    expect(parseLog('abc1234\tfeat: algo\thace 2 horas\tPepe\n')).toEqual([{ hash: 'abc1234', subject: 'feat: algo', when: 'hace 2 horas', author: 'Pepe' }]);
  });
});
