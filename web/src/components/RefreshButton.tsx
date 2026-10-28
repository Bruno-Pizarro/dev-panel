import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

const MIN_SPIN_MS = 700;

/** "Actualizar": gira al menos un instante para que se note que hizo algo, aunque la recarga sea inmediata. */
export const RefreshButton = ({ onRefresh, busy = false }: { onRefresh: () => void; busy?: boolean }) => {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(false), MIN_SPIN_MS);
    return () => window.clearTimeout(timer);
  }, [pulse]);
  const spinning = pulse || busy;
  return (
    <Button
      onClick={() => (setPulse(true), onRefresh())}
      title="Vuelve a leer el listado, el ticket abierto y sus datos de Redmine"
      icon={<RefreshCw className={cn('size-4', spinning && 'animate-spin')} />}
    >
      Actualizar
    </Button>
  );
};
