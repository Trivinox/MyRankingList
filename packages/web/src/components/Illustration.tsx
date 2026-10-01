import styles from './Illustration.module.css';

// Drawn here rather than imported as .svg files: Vite inlines a small asset
// as a data: URL, and the policy's img-src turns those away. Both drawings are
// decorative, since the text beside them already says what they mean.

interface IllustrationProps {
  className?: string;
}

// The same puzzled face on both, so the empty catalog and a missing image read
// as one character.
function Face({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse className={styles.cheek} cx="-11" cy="3" rx="3" ry="1.8" />
      <ellipse className={styles.cheek} cx="11" cy="3" rx="3" ry="1.8" />
      <circle className={styles.ink} cx="-7" cy="-2" r="2.6" />
      <circle className={styles.ink} cx="7" cy="-2" r="2.6" />
      <circle className={styles.shine} cx="-6.2" cy="-2.9" r="0.9" />
      <circle className={styles.shine} cx="7.8" cy="-2.9" r="0.9" />
      <circle className={styles.ink} cx="0" cy="5" r="2.2" />
    </g>
  );
}

// 4:3, the shape of the box an image takes on the pool card.
export function UnavailableImage({ className }: IllustrationProps) {
  return (
    <svg className={className} viewBox="0 0 120 90" aria-hidden="true">
      <rect className={styles.frame} x="20" y="14" width="80" height="62" rx="12" />
      <rect className={styles.canvas} x="28" y="22" width="64" height="46" rx="7" />
      <path
        className={styles.hill}
        d="M28 58c10-7 20-7 30-1s20 5 34-2v6a7 7 0 0 1-7 7H35a7 7 0 0 1-7-7z"
      />
      <Face x={60} y={40} />
      <circle className={styles.badge} cx="94" cy="18" r="12" />
      <path
        className={styles.mark}
        d="M90 14.5a4 4 0 1 1 5.5 3.7c-1.1.5-1.5 1.2-1.5 2.3"
        strokeWidth="3"
      />
      <circle className={styles.ink} cx="94" cy="24.6" r="1.7" />
    </svg>
  );
}

export function NothingFound({ className }: IllustrationProps) {
  return (
    <svg className={className} viewBox="0 0 120 100" aria-hidden="true">
      <path className={styles.handle} d="M79 71 97 89" strokeWidth="13" />
      <circle className={styles.frame} cx="56" cy="48" r="31" />
      <circle className={styles.glass} cx="56" cy="48" r="23" />
      <path className={styles.glint} d="M39 41a18 18 0 0 1 9-11" strokeWidth="3" />
      <Face x={56} y={50} />
      <path className={styles.sparkle} d="M101 12l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
      <path className={styles.sparkle} d="M17 72l1.4 4 4 1.4-4 1.4-1.4 4-1.4-4-4-1.4 4-1.4z" />
      <circle className={styles.dot} cx="104" cy="40" r="3" />
    </svg>
  );
}
