import { execFile } from 'node:child_process';

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Ejecuta un binario sin shell: los argumentos llegan literales al proceso. */
export const run = (file: string, args: string[], timeoutMs = 15_000): Promise<CommandResult> =>
  new Promise((resolvePromise) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolvePromise({ ok: !error, stdout: stdout.toString().trim(), stderr: (stderr.toString() || error?.message || '').trim() });
    });
  });

export const docker = (args: string[], timeoutMs?: number): Promise<CommandResult> => run('docker', args, timeoutMs);

export const listContainerNames = async (): Promise<string[]> => {
  const result = await docker(['ps', '-a', '--format', '{{.Names}}']);
  return result.ok ? result.stdout.split('\n').filter(Boolean).sort() : [];
};

export const listComposeServices = async (composeFile: string): Promise<string[]> => {
  const result = await docker(['compose', '-f', composeFile, 'config', '--services'], 30_000);
  return result.ok ? result.stdout.split('\n').filter(Boolean).sort() : [];
};
