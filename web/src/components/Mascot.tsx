import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { SpriteFace } from './SpriteFace';
import { CELEBRATE_EVENT } from '../lib/rewards/bus';
import { faceOf, mascotById, moodOf, MOOD_BADGE, MOOD_LINES, type Mood, type MoodInput } from '../lib/rewards/mascots';

/** Cuánto dura la cara de fiesta después de un festejo, y cuánto el globo cuando le hacés clic. */
const PARTY_MS = 4500;
const BUBBLE_MS = 4000;

/**
 * La mascota del pie: un bichito que reacciona a lo que pasa (duerme, trabaja cuando hay agentes, se preocupa si cae un servicio, festeja con
 * vos y se cansa al terminar la jornada). Al hacerle clic dice algo. Se elige y se nombra en Configuración → Diversión.
 */
export const Mascot = ({ mascotId, name, input }: { mascotId: string; name: string; input: Omit<MoodInput, 'celebrating'> }) => {
  const mascot = mascotById(mascotId);
  const [party, setParty] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [poked, setPoked] = useState(0);

  useEffect(() => {
    let timer = 0;
    const onCelebrate = () => {
      setParty(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setParty(false), PARTY_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (bubble === null) return;
    const timer = window.setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble, poked]);

  const mood: Mood = moodOf({ ...input, celebrating: party });
  const label = name.trim() || mascot.name;
  const poke = () => {
    const lines = MOOD_LINES[mood];
    setBubble(lines[Math.floor(Math.random() * lines.length)]!);
    setPoked((count) => count + 1);
  };
  return (
    <span className="relative flex shrink-0 items-center">
      {bubble && <span className="absolute bottom-full left-0 z-30 mb-2 w-max max-w-64 animate-fade-in rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg shadow-pop" role="status" data-testid="mascot-bubble">{bubble}</span>}
      <button type="button" onClick={poke} title={`${label} — hacele clic`} aria-label={`${label}, tu mascota`} data-testid="mascot" data-mood={mood} className="relative flex h-8 min-w-7 items-center justify-center rounded-md px-1 text-lg leading-none transition-transform hover:scale-110 active:scale-95">
        {mascot.sprite ? (
          <span className={cn('inline-block', mood === 'party' && 'mascot-party', mood === 'worried' && !mascot.sprite.worried && 'mascot-worried', mood === 'tired' && 'mascot-tired', mood === 'sleep' && 'mascot-sleep', mood === 'happy' && 'mascot-happy')}><SpriteFace sprite={mascot.sprite} mood={mood} height={28} /></span>
        ) : (
          <span className={cn('inline-block', `mascot-${mood}`)} aria-hidden>{faceOf(mascot, mood)}</span>
        )}
        {MOOD_BADGE[mood] && <span key={`${mood}-${poked}`} className="absolute -right-1 -top-1.5 text-sm leading-none" aria-hidden>{MOOD_BADGE[mood]}</span>}
      </button>
    </span>
  );
};
