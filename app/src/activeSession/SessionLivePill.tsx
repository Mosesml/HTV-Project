import { StatusPill } from '../ui';
import { useNow } from '../session/useNow';
import { formatElapsed, NO_VALUE, spokenElapsed } from './readings';

type Props = {
  /** Epoch ms when the session started (useSessionStartedAt); null once it has stopped. */
  startedAt: number | null;
};

const TICK_MS = 1000;

/** "Session live · 1h 42m". Ticks on its own so the rest of the screen doesn't re-render every second. */
export function SessionLivePill({ startedAt }: Props) {
  const now = useNow(TICK_MS);
  const elapsed = startedAt === null ? null : now - startedAt;
  return (
    <StatusPill
      tone="live"
      label="Session live"
      detail={elapsed === null ? NO_VALUE : formatElapsed(elapsed)}
      accessibilityLabel={`Session live, ${elapsed === null ? 'stopping' : spokenElapsed(elapsed)}`}
    />
  );
}
