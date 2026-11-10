/** Elogios sorpresa: frases con onda que salen de vez en cuando después de hacer algo. */
export const PRAISE: string[] = [
  'Ahí está. Así se hace.',
  'Con ese ritmo, el sprint te debe un asado.',
  'Prolijo. Muy prolijo.',
  'Eso no lo hace cualquiera. Lo hacés vos.',
  'Si hubiera un premio, ya lo tenés.',
  'Otro más para la colección.',
  'Mirá vos, qué máquina.',
  'Esa es la actitud.',
  'Hoy venís con todo.',
  'Cero drama, puro código.',
  'Eso estuvo bueno. Lo digo en serio.',
  'Tu yo de mañana te lo agradece.',
  'Nadie lo vio, pero yo sí: buen laburo.',
  'Sigue así y te invito un café virtual.',
  'Eso es trabajo fino.',
  'Bien ahí, crack.',
  'Un paso más y ya es costumbre.',
  'Ordenado y a tiempo. Una joya.',
  'Eso va directo al hall de la fama.',
  'Qué buena racha, che.',
  'Los tickets te tienen miedo.',
  'Se nota la mano.',
  'Esto sí que es tener las cosas bajo control.',
  'Me gusta cómo trabajás.',
  'Un aplauso en silencio (para no molestar).',
  'Ya casi sos una leyenda.',
  'Muy bien. Ahora, un vaso de agua.',
  'Hacer las cosas bien también se nota en el ánimo.',
  'Otra tarea menos en el mundo.',
  'Eso se llama avanzar.',
  'Fenómeno. Seguí.',
  'Hay gente que sueña con tener tu orden.',
  'La próxima va a salir todavía mejor.',
  'Código limpio, mente tranquila.',
  'Tu repo te quiere.',
  'Dale que va.',
  'Eso fue elegante.',
  'Acá se trabaja bien. Se nota.',
  'Qué ganas de que todo el equipo tuviera tu constancia.',
  'No es suerte, es oficio.',
];

export const pickPraise = (rng: () => number, last?: string): string => {
  const pool = PRAISE.filter((text) => text !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
};

/** Frases al cerrar el día, según cómo fue. */
export const CLOSE_LINES: Record<'big' | 'good' | 'quiet', string[]> = {
  big: ['Hoy la rompiste.', 'Día para enmarcar.', 'Eso fue un día de los grandes.', 'Te ganaste el descanso con intereses.'],
  good: ['Buen día de laburo.', 'Día cumplido.', 'Ahí vamos, un paso a la vez.', 'Se avanzó, y eso cuenta.'],
  quiet: ['Día tranquilo. Los hay.', 'No todos los días son de fuegos artificiales.', 'A veces el mejor aporte es no romper nada.', 'Mañana arrancamos con todo.'],
};
