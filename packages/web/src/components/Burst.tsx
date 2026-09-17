import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './Burst.module.css';

interface Dot {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}

// Placeholder pastels: the lilac, pink and peach of the palette for a
// placement, and the yellow the tie preview already uses for a tie.
const palette = ['#b7a8e8', '#f6b8c4', '#ffd6a5'];
const tieYellow = '#f0cf6e';

// Wider than tall, like the row it bursts out of.
const ring: Dot[] = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * 2 * Math.PI;
  return {
    from: { x: 0, y: 0 },
    to: { x: Math.cos(angle) * 72, y: Math.sin(angle) * 34 },
    color: palette[i % palette.length],
  };
});

// Pairs closing in on the seam between the two tied cards, one dot from each.
const pairs: Dot[] = [-96, -32, 32, 96].flatMap((x) => [
  { from: { x, y: -36 }, to: { x, y: -3 }, color: tieYellow },
  { from: { x, y: 36 }, to: { x, y: 3 }, color: tieYellow },
]);

interface BurstProps {
  variant: 'insert' | 'tie';
}

// Rendered with a new key on every drop, and gone once it has played so the
// dots do not sit invisible over the row. With reduced motion there is
// nothing left to show: a burst that does not move is a few dots blinking.
export function Burst({ variant }: BurstProps) {
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);

  if (reduceMotion || done) {
    return null;
  }

  const dots = variant === 'insert' ? ring : pairs;

  return (
    <span className={styles.burst} data-burst={variant} aria-hidden="true">
      {dots.map((dot, i) => (
        <motion.span
          key={i}
          className={styles.dot}
          style={{ backgroundColor: dot.color }}
          initial={{ ...dot.from, opacity: 1, scale: 1 }}
          animate={{ ...dot.to, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          onAnimationComplete={i === 0 ? () => setDone(true) : undefined}
        />
      ))}
    </span>
  );
}
