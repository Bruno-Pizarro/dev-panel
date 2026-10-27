import { useEffect, useState } from 'react';
import { LogView, type LogLine } from './LogView';
import { Modal } from './Modal';

const MAX_LINES = 3000;

/** Las líneas con colores ANSI ya traen su estilo; para las demás se resaltan errores y advertencias. */
const levelOf = (text: string): LogLine['level'] =>
  text.includes('\u001b[') ? undefined : /\[(error|critical|fatal)\]|\b(ERROR|FATAL|Exception)\b/.test(text) ? 'error' : /\[warn(ing)?\]|\bWARN(ING)?\b/.test(text) ? 'warn' : undefined;

/** Logs en vivo de un contenedor a pantalla completa, con los colores originales de su consola. */
export const ContainerLogs = ({ name, onClose }: { name: string | null; onClose: () => void }) => {
  const [lines, setLines] = useState<LogLine[]>([]);

  useEffect(() => {
    if (!name) return;
    setLines([]);
    const source = new EventSource(`/api/containers/${encodeURIComponent(name)}/stream`);
    source.onmessage = (event) => {
      const text = JSON.parse(event.data as string) as string;
      setLines((current) => [...current.slice(-(MAX_LINES - 1)), { text, level: levelOf(text) }]);
    };
    return () => source.close();
  }, [name]);

  return (
    <Modal open={name !== null} title={`Logs · ${name ?? ''}`} onClose={onClose} size="screen">
      <LogView lines={lines} className="min-h-0 flex-1" />
    </Modal>
  );
};
