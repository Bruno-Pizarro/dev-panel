import { run, type Runner } from '../docker.js';

/** Puertos del front y del propio panel (Vite): se reenvían además de los publicados por el compose. */
export const EXTRA_PORTS = [4200, 5173];
/** Puertos de depuración de Node (inspector): no sirven desde el navegador. */
const isInspector = (port: number): boolean => port >= 9229 && port <= 9340;

/** Puertos publicados en el host por el compose general, más el front y el panel; sin los del inspector. */
export const publishedPorts = async (composeFile: string, runner: Runner = run): Promise<number[]> => {
  const result = await runner('docker', ['compose', '-f', composeFile, 'config', '--format', 'json'], 30_000);
  const ports = new Set<number>(EXTRA_PORTS);
  if (result.ok) {
    try {
      const parsed = JSON.parse(result.stdout) as { services?: Record<string, { ports?: Array<{ published?: string | number }> }> };
      for (const service of Object.values(parsed.services ?? {})) {
        for (const entry of service.ports ?? []) {
          const port = Number(entry.published);
          if (Number.isInteger(port) && port > 0 && port < 65536 && !isInspector(port)) ports.add(port);
        }
      }
    } catch {
      // sin compose legible quedan solo el front y el panel
    }
  }
  return [...ports].sort((a, b) => a - b);
};
