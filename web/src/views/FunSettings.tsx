import { PartyPopper } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { REWARD_DEMO_EVENT } from '../components/RewardHost';
import { cn } from '../lib/cn';
import { useStoredState } from '../lib/hooks';
import { celebrate } from '../lib/rewards/bus';
import { DAY_WRAP_EVENT } from '../lib/rewards/dayWrap';
import { MASCOTS, mascotById } from '../lib/rewards/mascots';
import { DEFAULT_GAME_PREFS, EMPTY_GAME, gamePrefs, type GameState, type Prefs } from '../lib/rewards/types';

/** Configuración → Diversión: festejos, logros, elogios, sonido, cierre del día y la mascota (se elige entre varias y se le pone nombre). */
export const FunSettings = () => {
  const [stored, setStored] = useStoredState<Partial<Prefs>>('dev-panel.game.prefs', DEFAULT_GAME_PREFS);
  const [game, setGame] = useStoredState<GameState>('dev-panel.game.state', EMPTY_GAME);
  const prefs = gamePrefs(stored);
  const set = (patch: Partial<Prefs>) => setStored({ ...prefs, ...patch });
  const mascot = mascotById(prefs.mascotId);

  // Probar varias mascotas y ponerle nombre a una también son logros: se anota en lo que recuerda el juego.
  const flag = (patch: GameState['flags']) => {
    const flags = { ...game.flags, ...patch };
    const tried = Object.keys(flags).filter((key) => key.startsWith('mascot:') && flags[key]).length;
    setGame({ ...game, flags: { ...flags, mascotsTried: tried } });
  };
  const pick = (id: string) => {
    set({ mascotId: id });
    flag({ [`mascot:${id}`]: true });
  };
  const rename = (name: string) => {
    set({ mascotName: name.slice(0, 20) });
    if (name.trim()) flag({ mascotNamed: true });
  };

  return (
    <div className="space-y-6">
      <Card title="Diversión" action={<span className="flex flex-wrap gap-2"><Button icon={<PartyPopper className="size-4" />} onClick={() => celebrate('demo', 'big')}>Probar un festejo</Button><Button onClick={() => window.dispatchEvent(new Event(REWARD_DEMO_EVENT))}>Probar un logro</Button><Button onClick={() => window.dispatchEvent(new Event(DAY_WRAP_EVENT))}>Ver mi día ahora</Button></span>}>
        <p className="mb-4 text-muted">El panel te festeja cuando completás algo, te da logros con humor, anota tus récords y de vez en cuando te tira un elogio. Todo es local: lo que desbloqueaste vive en este navegador y nada sale de la máquina. No molestan con «No molestar» y no cuentan para el tope de avisos.</p>
        <div className="mb-5 flex flex-wrap gap-2">
          <Chip selected={prefs.enabled} onToggle={() => set({ enabled: !prefs.enabled })} hint="Apaga todo lo divertido junto">Diversión activada</Chip>
        </div>
        <div className={cn('flex flex-wrap gap-2', !prefs.enabled && 'opacity-50')}>
          <Chip selected={prefs.celebrations} onToggle={() => set({ celebrations: !prefs.celebrations })} hint="Confeti cuando completás algo (se respeta «reducir movimiento» del sistema)">Festejos (confeti)</Chip>
          <Chip selected={prefs.achievements} onToggle={() => set({ achievements: !prefs.achievements })} hint="Logros con humor: diarios y de toda la vida, algunos secretos">Logros y récords</Chip>
          <Chip selected={prefs.praise} onToggle={() => set({ praise: !prefs.praise })} hint="A veces, después de hacer algo, una frase con onda (como mucho 6 por día)">Elogios sorpresa</Chip>
          <Chip selected={prefs.sound} onToggle={() => set({ sound: !prefs.sound })} hint="Un sonido suave al festejar. Apagado por defecto">Sonido</Chip>
          <Chip selected={prefs.closeDay} onToggle={() => set({ closeDay: !prefs.closeDay })} hint="Al terminar la jornada, un resumen de tu día">Cierre del día</Chip>
        </div>
      </Card>
      <Card title="Tu mascota" action={<Chip selected={prefs.mascot} onToggle={() => set({ mascot: !prefs.mascot })} hint="Vive en la barra de actividad del pie">Mostrar la mascota</Chip>}>
        <p className="mb-4 text-muted">Vive en la barra de actividad (si la tenés prendida) y reacciona a lo que pasa: duerme, trabaja cuando hay agentes, se preocupa si se cae un servicio y festeja con vos. Hacele clic para que te diga algo.</p>
        <div className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6', !prefs.mascot && 'opacity-50')} role="radiogroup" aria-label="Elegí tu mascota">
          {MASCOTS.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={prefs.mascotId === item.id} onClick={() => pick(item.id)} className={cn('flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-colors', prefs.mascotId === item.id ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-accent/40')}>
              <span className="text-3xl" aria-hidden>{item.emoji}</span>
              <span className="text-sm font-medium">{item.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 max-w-sm">
          <Field label="Su nombre" help={`Si lo dejás vacío se llama «${mascot.name}».`} value={prefs.mascotName} onChange={(value) => rename(String(value))} />
        </div>
      </Card>
    </div>
  );
};
