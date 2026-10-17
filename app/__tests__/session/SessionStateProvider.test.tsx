import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import type { Snapshot } from '../../modules/raveguard-native';
import { IDLE_SNAPSHOT } from '../../modules/raveguard-native/src/mock';
import { SessionStateProvider, useSessionState } from '../../src/session/SessionStateProvider';
import { FALL_TRIGGER, nativeMock, PHASES } from '../../test-utils/nativeMock';

// The UI redesign's additions to the session state: the AirPods connection and the check-in
// trigger, both straight from Swift.

function Probe() {
  const { phase, airPodsConnected } = useSessionState();
  return (
    <>
      <Text testID="airPods">{String(airPodsConnected)}</Text>
      <Text testID="trigger">{phase?.trigger?.kind ?? 'none'}</Text>
    </>
  );
}

async function renderProbe(snapshot: Partial<Snapshot> = {}) {
  nativeMock().setSnapshot({ ...IDLE_SNAPSHOT, ...snapshot });
  render(
    <SessionStateProvider>
      <Probe />
    </SessionStateProvider>
  );
  await act(async () => {});
}

beforeEach(() => nativeMock().reset());

describe('SessionStateProvider: AirPods', () => {
  test('unknown until Swift says', async () => {
    await renderProbe();
    expect(screen.getByTestId('airPods')).toHaveTextContent('null');
  });

  test('from the snapshot, then from onAirPods', async () => {
    await renderProbe({ airPodsConnected: true });
    expect(screen.getByTestId('airPods')).toHaveTextContent('true');
    await act(async () => nativeMock().emit('onAirPods', { connected: false }));
    expect(screen.getByTestId('airPods')).toHaveTextContent('false');
  });
});

describe('SessionStateProvider: trigger', () => {
  test('a check-in carries what started it; monitoring clears it', async () => {
    await renderProbe({ phase: PHASES.monitoring });
    expect(screen.getByTestId('trigger')).toHaveTextContent('none');
    await act(async () => nativeMock().emit('onPhase', { ...PHASES.whisper, trigger: FALL_TRIGGER }));
    expect(screen.getByTestId('trigger')).toHaveTextContent('fall');
    await act(async () => nativeMock().emit('onPhase', PHASES.monitoring));
    expect(screen.getByTestId('trigger')).toHaveTextContent('none');
  });
});
