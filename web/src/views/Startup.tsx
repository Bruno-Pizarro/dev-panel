import { Ban, Check, CircleDashed, Loader2, Minus, Play, Power, RotateCcw, Save, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ConfirmModal } from '../components/ConfirmModal';
import { LogView } from '../components/LogView';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useServerEvent, useStoredState } from '../lib/hooks';
import type { DevPanelConfig, Preset, RunState, StepState, StepStatus } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { pillStyle, serviceColor } from '../lib/colors';

const stepIcon: Record<StepStatus, { icon: typeof Check; cls: string }> = {
  pending: { icon: CircleDashed, cls: 'text-muted' },
  running: { icon: Loader2, cls: 'animate-spin text-info' },
  done: { icon: Check, cls: 'text-success' },
  error: { icon: XCircle, cls: 'text-danger' },
  skipped: { icon: Minus, cls: 'text-muted' },
};

const Timeline = ({ steps }: { steps: StepState[] }) => (
  <ol className="space-y-1">
    {steps.map((step, index) => {
      const { icon: Icon, cls } = stepIcon[step.status];
      return (
        <li key={step.id} className="relative flex gap-4 pb-5 last:pb-0">
          {index < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-line" aria-hidden />}
          <span className={cn('z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface', step.status === 'done' ? 'border-success/40' : step.status === 'error' ? 'border-danger/40' : 'border-line')}>
            <Icon className={cn('size-4', cls)} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className={cn('font-medium', step.status === 'pending' && 'text-muted')}>{step.label}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {step.services.map((service) => (
                <span key={service} className="rounded-md border px-2 py-0.5 font-mono text-sm" style={pillStyle(serviceColor(service))}>{service}</span>
              ))}
            </div>
            {step.message && <p className={cn('mt-1.5 text-sm', step.status === 'error' ? 'text-danger' : 'text-muted')}>{step.message}</p>}
          </div>
        </li>
      );
    })}
  </ol>
);

export const Startup = ({ config }: { config: DevPanelConfig }) => {
  const toast = useToast();
  const { startup } = config;
  const [selected, setSelected] = useStoredState<string[]>('devpanel.startup.selected', []);
  const [run, setRun] = useState<RunState | null>(null);
  const [plan, setPlan] = useState<StepState[]>([]);
  const [presetName, setPresetName] = useState('');
  const [stopScope, setStopScope] = useState<'apps' | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const presets = useAsync(() => api.get<{ shared: Preset[]; personal: Preset[] }>('/api/presets'));

  // Estado inicial (por si se recargó la página en medio de un levantado) y avance en vivo por SSE.
  useEffect(() => {
    api.get<{ run: RunState }>('/api/startup/state').then((result) => setRun(result.run.status === 'idle' ? null : result.run), () => undefined);
  }, []);
  useServerEvent<RunState>('startup', setRun);

  const valid = useMemo(() => selected.filter((name) => startup.optional.includes(name)), [selected, startup.optional]);
  useEffect(() => {
    api.get<{ steps: StepState[] }>(`/api/startup/plan?services=${valid.join(',')}`).then((result) => setPlan(result.steps), () => setPlan([]));
  }, [valid]);

  const running = run?.status === 'running';
  const failedStep = run?.status === 'error' ? run.steps.find((step) => step.status === 'error') : undefined;
  const toggle = (name: string) => setSelected(valid.includes(name) ? valid.filter((item) => item !== name) : [...valid, name]);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

  const call = async (action: () => Promise<unknown>, okMessage?: string) => {
    setBusy(true);
    try {
      await action();
      if (okMessage) toast('success', okMessage);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePreset = () =>
    call(async () => {
      const name = presetName.trim();
      if (!name) throw new Error('Poné un nombre para el preset.');
      const personal = [...(presets.data?.personal ?? []).filter((preset) => preset.name !== name), { name, services: valid }];
      await api.put('/api/presets/personal', personal);
      setPresetName('');
      presets.reload();
    }, 'Preset guardado.');

  const deletePreset = (name: string) =>
    call(async () => {
      await api.put('/api/presets/personal', (presets.data?.personal ?? []).filter((preset) => preset.name !== name));
      presets.reload();
    });

  return (
    <>
      <PageHeader
        title="Levantado"
        description="MinIO › RabbitMQ y Mongo › servicios, siempre en este orden."
        actions={<Button variant="danger" icon={<Power className="size-4" />} disabled={running} onClick={() => setStopScope('apps')}>Detener…</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Qué levantar">
            <div className="space-y-5">
              <div>
                <div className="mb-2 font-medium">Presets</div>
                <div className="flex flex-wrap items-center gap-2">
                  {(presets.data?.shared ?? []).map((preset) => (
                    <Chip key={`s-${preset.name}`} selected={sameSet(valid, preset.services)} onToggle={() => setSelected(preset.services)} hint="Preset compartido">{preset.name}</Chip>
                  ))}
                  {(presets.data?.personal ?? []).map((preset) => (
                    <span key={`p-${preset.name}`} className="inline-flex items-center gap-1">
                      <Chip selected={sameSet(valid, preset.services)} onToggle={() => setSelected(preset.services)} hint="Preset personal">{preset.name}</Chip>
                      <button type="button" aria-label={`Borrar ${preset.name}`} onClick={() => deletePreset(preset.name)} className="rounded-full p-1 text-muted hover:text-danger"><X className="size-4" /></button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 font-medium">Siempre se levantan</div>
                <div className="flex flex-wrap gap-2">{startup.mandatory.map((name) => <Chip key={name} locked selected color={serviceColor(name)}>{name}</Chip>)}</div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between font-medium">
                  Opcionales
                  <span className="text-sm font-normal text-muted">{valid.length} elegidos</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {startup.optional.map((name) => (
                    <Chip key={name} color={serviceColor(name)} selected={valid.includes(name)} onToggle={() => toggle(name)} hint={startup.groups[name] ? `También levanta ${startup.groups[name]!.withStage2.join(', ')}` : undefined}>{name}</Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Guardar esta selección como preset…" maxLength={40} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60" />
                <Button icon={<Save className="size-4" />} loading={busy} onClick={savePreset}>Guardar</Button>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            {running ? (
              <Button className="h-12 flex-1" variant="danger" icon={<Ban className="size-5" />} onClick={() => call(() => api.post('/api/startup/cancel'))}>Cancelar levantado</Button>
            ) : (
              <Button className="h-12 flex-1" variant="primary" icon={<Play className="size-5" />} loading={busy} onClick={() => call(() => api.post('/api/startup/run', { services: valid }))}>Levantar</Button>
            )}
            {failedStep && (
              <Button className="h-12" icon={<RotateCcw className="size-5" />} loading={busy} onClick={() => call(() => api.post('/api/startup/run', { services: run!.selected, from: failedStep.id }))}>Reintentar desde esta etapa</Button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card
            title={run ? 'Progreso' : 'Plan'}
            action={run && <span className={cn('text-sm font-medium', run.status === 'done' ? 'text-success' : run.status === 'error' ? 'text-danger' : run.status === 'cancelled' ? 'text-warning' : 'text-info')}>{{ idle: '', running: 'En curso…', done: 'Completado', error: 'Con errores', cancelled: 'Cancelado' }[run.status]}</span>}
          >
            <Timeline steps={run ? run.steps : plan} />
          </Card>
          <Card title="Salida">
            <LogView lines={run?.log.map((line) => ({ text: line.text, level: line.level })) ?? []} className="h-60" />
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={stopScope !== null}
        title="Detener servicios"
        confirmLabel="Detener"
        danger
        loading={busy}
        onCancel={() => setStopScope(null)}
        onConfirm={() => stopScope && call(async () => { await api.post('/api/startup/stop', { scope: stopScope, confirm: true }); setStopScope(null); }, 'Servicios detenidos.')}
      >
        <div className="space-y-3">
          <p>Elegí qué detener:</p>
          <div className="flex gap-2">
            <Chip selected={stopScope === 'apps'} onToggle={() => setStopScope('apps')}>Solo los servicios</Chip>
            <Chip selected={stopScope === 'all'} onToggle={() => setStopScope('all')}>Todo (incluye RabbitMQ, Mongo y MinIO)</Chip>
          </div>
        </div>
      </ConfirmModal>
    </>
  );
};
