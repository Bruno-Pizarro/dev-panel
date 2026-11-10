import { Bell } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { NUDGE_DEMO_EVENT } from '../components/NudgeHost';
import { useStoredState } from '../lib/hooks';
import { DEFAULT_BAR_PREFS, SEGMENT_LABELS, withDefaults, type ActivityBarPrefs, type SegmentId } from '../lib/activityBar';
import { DEFAULT_PREFS, KIND_LABELS, MAX_FUNNY_PER_DAY, type NudgeKind, type NudgePrefs } from '../lib/nudges';

const KINDS = Object.keys(KIND_LABELS) as NudgeKind[];
const SEGMENTS = Object.keys(SEGMENT_LABELS) as SegmentId[];
const clamp = (value: number, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : fallback)));

/** Configuración → Avisos: los avisos espontáneos de abajo a la derecha. Todo se guarda al instante en este navegador. */
export const NudgeSettings = () => {
  const [prefs, setPrefs] = useStoredState<NudgePrefs>('dev-panel.nudges.prefs', DEFAULT_PREFS);
  // Las preferencias guardadas antes de que existiera un campo se completan con las de por defecto.
  const current: NudgePrefs = { ...DEFAULT_PREFS, ...prefs };
  const set = (patch: Partial<NudgePrefs>) => setPrefs({ ...current, ...patch });
  const toggleKind = (kind: NudgeKind) => set({ muted: current.muted.includes(kind) ? current.muted.filter((item) => item !== kind) : [...current.muted, kind] });
  const [storedBar, setBar] = useStoredState<Partial<ActivityBarPrefs>>('dev-panel.activitybar.prefs', DEFAULT_BAR_PREFS);
  const bar = withDefaults(storedBar);
  const toggleSegment = (id: SegmentId) => setBar({ ...bar, segments: { ...bar.segments, [id]: !bar.segments[id] } });
  return (
    <div className="space-y-6">
    <Card title="Avisos" action={<Button icon={<Bell className="size-4" />} onClick={() => window.dispatchEvent(new Event(NUDGE_DEMO_EVENT))}>Ver cómo se ve</Button>}>
      <p className="mb-4 text-muted">De vez en cuando el panel muestra, abajo a la derecha, algo que conviene no olvidar (cambios sin commitear, un servicio caído, lo que falta de la jornada…). Es una tarjeta discreta que se cierra sola a los 15 segundos. No avisa con «No molestar», en pantalla completa ni mientras escribís. Solo usa datos locales: no consulta Redmine ni GitLab.</p>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip selected={current.enabled} onToggle={() => set({ enabled: !current.enabled })} hint="Apaga todos los avisos espontáneos">Avisos activados</Chip>
        <Chip selected={current.funny} onToggle={() => set({ funny: !current.funny })} hint={`De vez en cuando una frase graciosa, hasta ${MAX_FUNNY_PER_DAY} por día y solo si no hay un aviso útil pendiente`}>Frases graciosas</Chip>
      </div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Qué avisar</h3>
      <div className="mb-5 flex flex-wrap gap-2">
        {KINDS.map((kind) => <Chip key={kind} selected={!current.muted.includes(kind)} onToggle={() => toggleKind(kind)}>{KIND_LABELS[kind]}</Chip>)}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Mínimo entre un aviso y otro (minutos)" type="number" min={15} max={240} help="Por defecto 45." value={current.minGapMin} onChange={(value) => set({ minGapMin: clamp(Number(value), 15, 240, 45) })} />
        <Field label="Máximo de avisos por día" type="number" min={1} max={30} help="Por defecto 8. Cuentan también las frases graciosas." value={current.maxPerDay} onChange={(value) => set({ maxPerDay: clamp(Number(value), 1, 30, 8) })} />
      </div>
    </Card>
    <Card title="Barra de actividad">
      <p className="mb-4 text-muted">Una fila fina al pie de todas las pantallas con lo que estás haciendo: en qué repo, rama y ticket estás, los commits de hoy, los agentes de Claude y los tokens de hoy, cuánto llevás de jornada y cómo está el entorno. Cada parte lleva a su pantalla. Solo usa datos locales.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip selected={bar.enabled} onToggle={() => setBar({ ...bar, enabled: !bar.enabled })} hint="Muestra u oculta la barra entera">Barra activada</Chip>
      </div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Qué muestra</h3>
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((id) => <Chip key={id} selected={bar.segments[id]} onToggle={() => toggleSegment(id)}>{SEGMENT_LABELS[id]}</Chip>)}
      </div>
    </Card>
    </div>
  );
};
