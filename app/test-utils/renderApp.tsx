import { act, renderRouter } from 'expo-router/testing-library';

import type { EscalationEvent, MotionEvent, PhaseEvent, Snapshot } from '../modules/raveguard-native';
import { IDLE_SNAPSHOT } from '../modules/raveguard-native/src/mock';
import { nativeMock } from './nativeMock';

// renderRouter resolves this against the working directory, which is app/ under `npm test`.
const APP_DIR = './src/app';

/**
 * Renders the real route tree (src/app, root layout included) at `initialUrl`, with the
 * native mock's `getSnapshot()` returning `snapshot` merged over idle, and waits for that
 * snapshot to land.
 */
export async function renderApp(initialUrl: string, snapshot: Partial<Snapshot> = {}) {
  nativeMock().setSnapshot({ ...IDLE_SNAPSHOT, ...snapshot });
  const result = renderRouter(APP_DIR, { initialUrl });
  await act(async () => {});
  return result;
}

/** Pushes an `onPhase` event from "Swift" and lets the screens react. */
export async function emitPhase(phase: PhaseEvent): Promise<void> {
  await act(async () => {
    nativeMock().emit('onPhase', phase);
  });
}

/** Pushes an `onEscalation` event from "Swift". */
export async function emitEscalation(escalation: EscalationEvent): Promise<void> {
  await act(async () => {
    nativeMock().emit('onEscalation', escalation);
  });
}

/** Pushes an `onMotion` event from "Swift". */
export async function emitMotion(motion: MotionEvent): Promise<void> {
  await act(async () => {
    nativeMock().emit('onMotion', motion);
  });
}
