import { useEffect, useState } from 'react';
import { CaretCircleDownIcon, CaretCircleUpIcon } from '@phosphor-icons/react';
import styles from './ScrollEdges.module.css';

// Read the way dnd-kit reads it before scrolling, so an arrow is up exactly
// where holding the item would move the page.
function scrollable() {
  const page = document.documentElement;
  return {
    up: page.scrollTop > 0,
    down: page.scrollTop < page.scrollHeight - window.innerHeight,
  };
}

// Mounted for the length of a drag. Marks the edges of the window that scroll
// the page, and only the ones it can still go towards.
export function ScrollEdges() {
  const [edges, setEdges] = useState(scrollable);

  useEffect(() => {
    const update = () => setEdges(scrollable());
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <>
      {edges.up && (
        <CaretCircleUpIcon className={`${styles.arrow} ${styles.up}`} aria-hidden="true" />
      )}
      {edges.down && (
        <CaretCircleDownIcon className={`${styles.arrow} ${styles.down}`} aria-hidden="true" />
      )}
    </>
  );
}
