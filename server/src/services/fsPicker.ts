import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

export type PickKind = 'folder' | 'file';
export type Platform = 'wsl' | 'darwin' | 'win32' | 'linux';

export const detectPlatform = (): Platform => {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win32';
  const isWsl = Boolean(process.env['WSL_DISTRO_NAME']) || (existsSync('/proc/version') && /microsoft/i.test(readFileSync('/proc/version', 'utf8')));
  return isWsl ? 'wsl' : 'linux';
};

export interface PickerCommand {
  file: string;
  args: string[];
  /** Variables para el script (así los textos nunca se concatenan dentro del código). */
  env: Record<string, string>;
}

const TITLES: Record<PickKind, string> = { folder: 'Elegí una carpeta', file: 'Elegí un archivo' };

const POWERSHELL = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
if ($env:DP_KIND -eq 'folder') {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $env:DP_TITLE
  $d.ShowNewFolderButton = $false
  if ($env:DP_INITIAL -and (Test-Path -LiteralPath $env:DP_INITIAL)) { $d.SelectedPath = $env:DP_INITIAL }
  if ($d.ShowDialog($owner) -eq 'OK') { Write-Output $d.SelectedPath }
} else {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Title = $env:DP_TITLE
  if ($env:DP_INITIAL -and (Test-Path -LiteralPath $env:DP_INITIAL)) { $d.InitialDirectory = $env:DP_INITIAL }
  if ($d.ShowDialog($owner) -eq 'OK') { Write-Output $d.FileName }
}
`;

/** Comando del selector nativo de cada sistema. `null` = no hay selector disponible (la interfaz usa su explorador propio). */
export const buildPickerCommand = (platform: Platform, kind: PickKind, initial: string | null): PickerCommand | null => {
  const title = TITLES[kind];
  if (platform === 'wsl' || platform === 'win32') {
    return {
      file: platform === 'wsl' ? 'powershell.exe' : 'powershell',
      args: ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL],
      env: { DP_KIND: kind, DP_TITLE: title, DP_INITIAL: initial ?? '' },
    };
  }
  if (platform === 'darwin') {
    const script = kind === 'folder' ? 'POSIX path of (choose folder with prompt (system attribute "DP_TITLE"))' : 'POSIX path of (choose file with prompt (system attribute "DP_TITLE"))';
    return { file: 'osascript', args: ['-e', script], env: { DP_TITLE: title } };
  }
  return { file: 'zenity', args: ['--file-selection', ...(kind === 'folder' ? ['--directory'] : []), `--title=${title}`, ...(initial ? [`--filename=${initial}/`] : [])], env: {} };
};

const exec = (file: string, args: string[], env: Record<string, string>, timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string; missing: boolean }> =>
  new Promise((resolvePromise) => {
    execFile(file, args, { env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolvePromise({ ok: !error, stdout: stdout.toString().trim(), stderr: stderr.toString().trim(), missing: (error as NodeJS.ErrnoException | null)?.code === 'ENOENT' });
    });
  });

export type PickResult = { status: 'picked'; path: string } | { status: 'cancelled' } | { status: 'unavailable'; reason: string };

/** Abre el selector nativo del sistema (en WSL, el de Windows) y devuelve la ruta elegida ya convertida al sistema local. */
export const pickPath = async (kind: PickKind, initial: string | null, platform: Platform = detectPlatform()): Promise<PickResult> => {
  let initialNative = initial && existsSync(initial) ? initial : null;
  if (platform === 'wsl' && initialNative) {
    const converted = await exec('wslpath', ['-w', initialNative], {}, 5_000);
    initialNative = converted.ok ? converted.stdout : null;
  }
  const command = buildPickerCommand(platform, kind, initialNative);
  if (!command) return { status: 'unavailable', reason: 'No hay selector nativo en este sistema' };
  const result = await exec(command.file, command.args, command.env, 10 * 60_000);
  if (result.missing) return { status: 'unavailable', reason: `No se encontró ${command.file}` };
  if (!result.stdout) return result.ok || /cancel/i.test(result.stderr) ? { status: 'cancelled' } : { status: 'unavailable', reason: result.stderr || 'El selector falló' };
  if (platform === 'wsl') {
    const converted = await exec('wslpath', ['-u', result.stdout], {}, 5_000);
    return converted.ok ? { status: 'picked', path: converted.stdout } : { status: 'unavailable', reason: 'No se pudo convertir la ruta de Windows' };
  }
  return { status: 'picked', path: result.stdout.replace(/\/$/, '') || result.stdout };
};

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: DirEntry[];
  truncated: boolean;
}

const MAX_ENTRIES = 500;

/** Explorador propio de carpetas (respaldo del selector nativo). Solo nombres: nunca contenido de archivos. */
export const listDir = (requested: string, includeFiles: boolean): DirListing => {
  const path = resolve(requested.replace(/^~(?=$|\/)/, homedir()));
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error('La carpeta no existe');
  const real = realpathSync(path);
  const all = readdirSync(real, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() || (entry.isSymbolicLink() && safeIsDir(join(real, entry.name))) }))
    .filter((entry) => entry.isDir || includeFiles)
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  return { path: real, parent: real === sep ? null : dirname(real), entries: all.slice(0, MAX_ENTRIES), truncated: all.length > MAX_ENTRIES };
};

const safeIsDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
