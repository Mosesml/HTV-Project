import { RING } from '../ui';

// Check-in must fit without scrolling. On a 667 pt iPhone SE the loud stage (trigger card,
// 240 pt ring, heading, 96 pt button) runs past the bottom, so short screens use one smaller
// ring. It is the same for every stage, so the ring never changes size mid check-in.

/** Window heights below this get the compact ring. */
export const COMPACT_SCREEN_HEIGHT = 720;
export const COMPACT_RING_SIZE = 196;

/** The ring size for a window `height` points tall. */
export function checkInRingSize(height: number): number {
  return height < COMPACT_SCREEN_HEIGHT ? COMPACT_RING_SIZE : RING.size;
}
