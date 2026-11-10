import type { CelebrationLevel } from './types';

/** Efectos de los festejos: confeti sobre toda la pantalla y sonidos cortos. Respetan «reducir movimiento» del sistema. */
const reducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const channels = (name: string): string => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '120 120 255'})`;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  spin: number;
  angle: number;
  life: number;
}

const COUNT: Record<CelebrationLevel, number> = { small: 22, medium: 70, big: 150 };

/** Confeti con los colores del tema que salta desde abajo al centro y cae. Dura un par de segundos y se limpia solo. */
export const confetti = (level: CelebrationLevel): void => {
  if (reducedMotion() || typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(ratio, ratio);
  const colors = ['--accent', '--success', '--warning', '--info', '--danger'].map(channels);
  const originX = window.innerWidth / 2;
  const originY = window.innerHeight - 70;
  const particles: Particle[] = Array.from({ length: COUNT[level] }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (level === 'small' ? 1.2 : 2.2);
    const speed = (level === 'small' ? 7 : 11) + Math.random() * (level === 'big' ? 11 : 7);
    return { x: originX + (Math.random() - 0.5) * 60, y: originY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 5 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)]!, spin: (Math.random() - 0.5) * 0.4, angle: Math.random() * Math.PI, life: 0 };
  });
  const started = performance.now();
  const frame = (time: number) => {
    const elapsed = time - started;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const particle of particles) {
      particle.life += 1;
      particle.vy += 0.38;
      particle.vx *= 0.992;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.angle += particle.spin;
      context.save();
      context.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.fillStyle = particle.color;
      context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      context.restore();
    }
    if (elapsed < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
};

let audio: AudioContext | null = null;
/** Notas (Hz) y duración de cada sonido; suave y corto. */
const SOUNDS: Record<'ding' | 'chime' | 'fanfare', Array<[number, number]>> = {
  ding: [[880, 0.12]],
  chime: [[659, 0.1], [880, 0.1], [1175, 0.18]],
  fanfare: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]],
};

export const playSound = (kind: 'ding' | 'chime' | 'fanfare'): void => {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    let at = audio.currentTime;
    for (const [frequency, length] of SOUNDS[kind]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + length + 0.02);
      at += length * 0.85;
    }
  } catch {
    /* sin audio: no pasa nada */
  }
};

export const soundFor = (level: CelebrationLevel): 'ding' | 'chime' | 'fanfare' => (level === 'big' ? 'fanfare' : level === 'medium' ? 'chime' : 'ding');
