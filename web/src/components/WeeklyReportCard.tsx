import { ClipboardCopy, FileText } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { WeeklyReport } from '../lib/types';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { useToast } from './Toast';

type Week = 'current' | 'previous';

/** Copia un pedido para Claude con los datos de la semana y el formato del Google Doc de avances. */
export const WeeklyReportCard = () => {
  const toast = useToast();
  const [week, setWeek] = useState<Week>('current');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<WeeklyReport | null>(null);

  const copy = async () => {
    setBusy(true);
    try {
      const report = await api.post<WeeklyReport>('/api/daily/weekly', { week });
      setLast(report);
      await navigator.clipboard.writeText(report.prompt);
      toast('success', `Pedido copiado (${report.tickets.length} tickets, semana ${report.range.label}). Pegalo en la extensión de Claude.`);
    } catch (error) {
      toast('error', (error as Error).message || 'No se pudo copiar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6" title={<span className="inline-flex items-center gap-3"><FileText className="size-5 text-accent" aria-hidden />Resumen semanal</span>}>
      <p className="mb-4 text-muted">Copia un pedido con lo que hiciste en la semana (commits, revisiones, MRs, análisis y estimaciones por ticket) y el formato de tu reporte del Google Doc. Lo pegás en la extensión de Claude y te devuelve el bloque listo para copiar.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Chip selected={week === 'current'} onToggle={() => setWeek('current')}>Esta semana</Chip>
        <Chip selected={week === 'previous'} onToggle={() => setWeek('previous')}>Semana pasada</Chip>
        <Button variant="primary" icon={<ClipboardCopy className="size-4" />} loading={busy} onClick={copy}>Copiar pedido semanal para Claude</Button>
      </div>
      {last && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted hover:text-fg">Ver los datos que se incluyeron ({last.tickets.length} tickets)</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-3 font-mono text-sm">{last.data}</pre>
        </details>
      )}
    </Card>
  );
};
