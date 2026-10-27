import { useEffect, useState } from 'react';
import { LogView, type LogLine } from './LogView';
import { Modal } from './Modal';

const MAX_LINES = 2000;
const levelOf = (text: string): LogLine['level'] => (/\b(error|fatal|exception)\b/i.test(text) ? 'error' : /\bwarn(ing)?\b/i.test(text) ? 'warn' : 'info');

/** Logs en vivo de un contenedor: se conecta por SSE mientras el modal esté abierto. */
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
    <Modal open={name !== null} title={`Logs · ${name ?? ''}`} onClose={onClose} size="xl">
      <LogView lines={lines} className="h-[60vh]" />
    </Modal>
  );
};
