import { stripFor, type Mood, type SpriteSet } from '../lib/rewards/mascots';

/** Un sprite animado de una mascota para un ánimo, dibujado a `height` px de alto. */
export const SpriteFace = ({ sprite, mood, height = 28 }: { sprite: SpriteSet; mood: Mood; height?: number }) => {
  const { strip, speed, frozen } = stripFor(sprite, mood);
  const scale = height / sprite.frameH;
  const width = Math.round(sprite.frameW * scale);
  const total = Math.round(sprite.frameW * scale * strip.frames);
  return (
    <span
      className="sprite-face inline-block shrink-0"
      aria-hidden
      data-testid="sprite-face"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundImage: `url(${strip.src})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${total}px ${height}px`,
        imageRendering: sprite.pixelated ? 'pixelated' : 'auto',
        ['--sprite-end' as string]: `-${total}px`,
        animation: frozen || strip.frames < 2 ? 'none' : `sprite-play ${(strip.frames / (strip.fps * speed)).toFixed(3)}s steps(${strip.frames}) infinite`,
      }}
    />
  );
};
