import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import type { PhaseEvent, Snapshot } from '../../modules/raveguard-native';
import { IDLE_SNAPSHOT } from '../../modules/raveguard-native/src/mock';
import {
  AIRPODS_CONNECTED,
  AIRPODS_DISCONNECTED,
  CONNECTION_SETTLE_MS,
  NO_MOTION_HINT,
  NO_MOTION_HINT_MS,
} from '../../src/airpods/airPodsAlerts';
import { useAirPodsAlerts } from '../../src/airpods/useAirPodsAlerts';
import { SessionStateProvider } from '../../src/session/SessionStateProvider';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';

beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterAll(() => jest.useRealTimers());

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  nativeMock().reset();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  return <SessionStateProvider>{children}</SessionStateProvider>;
}

/** Mounts the hook under the session provider and lets the snapshot land. */
async function render(snapshot: Partial<Snapshot> = {}) {
  nativeMock().setSnapshot({ ...IDLE_SNAPSHOT, ...snapshot });
  const hook = renderHook(() => useAirPodsAlerts(), { wrapper });
  await act(async () => {});
  return hook;
}

async function airPods(connected: boolean, settle = true): Promise<void> {
  await act(async () => nativeMock().emit('onAirPods', { connected }));
  if (settle) await advance(CONNECTION_SETTLE_MS);
}

async function phase(event: PhaseEvent): Promise<void> {
  await act(async () => nativeMock().emit('onPhase', event));
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function dialogs(): string[] {
  return alertSpy.mock.calls.map((call) => call[0] as string);
}

describe('useAirPodsAlerts: connection changes', () => {
  test('brief alternating connection events do not queue disconnect/reconnect dialogs', async () => {
    await render({ phase: PHASES.monitoring, airPodsConnected: true });
    for (let i = 0; i < 10; i += 1) {
      await airPods(false, false);
      await advance(100);
      await airPods(true, false);
      await advance(100);
    }
    await advance(2000);
    expect(dialogs()).toEqual([]);
  });

  test('a persistent disconnect is still reported and duplicate events do not defer it', async () => {
    await render({ phase: PHASES.monitoring, airPodsConnected: true });
    await airPods(false, false);
    await advance(CONNECTION_SETTLE_MS - 1);
    expect(dialogs()).toEqual([]);
    await airPods(false, false);
    await advance(1);
    expect(dialogs()).toEqual([AIRPODS_DISCONNECTED.title]);
    await airPods(true);
    expect(dialogs()).toEqual([AIRPODS_DISCONNECTED.title, AIRPODS_CONNECTED.title]);
  });

  test('unmount cancels a pending connection dialog', async () => {
    const hook = await render({ airPodsConnected: true });
    await airPods(false, false);
    hook.unmount();
    await advance(CONNECTION_SETTLE_MS);
    expect(dialogs()).toEqual([]);
  });

  test('shows "connected" once, however often Swift repeats it', async () => {
    await render();
    await airPods(true);
    await airPods(true);
    expect(alertSpy.mock.calls).toEqual([[AIRPODS_CONNECTED.title, AIRPODS_CONNECTED.message]]);
  });

  test('out and back in: disconnected, then connected again, once each', async () => {
    await render();
    await airPods(true);
    await airPods(false);
    await airPods(false);
    await airPods(true);
    expect(dialogs()).toEqual([AIRPODS_CONNECTED.title, AIRPODS_DISCONNECTED.title, AIRPODS_CONNECTED.title]);
    expect(alertSpy.mock.calls[1]).toEqual([AIRPODS_DISCONNECTED.title, AIRPODS_DISCONNECTED.message]);
  });

  test('a relaunch that is already connected shows nothing', async () => {
    await render({ phase: PHASES.monitoring, airPodsConnected: true });
    await airPods(true);
    await advance(NO_MOTION_HINT_MS * 2);
    expect(dialogs()).toEqual([]);
  });

  test('an event that beats the snapshot wins over it', async () => {
    let resolveSnapshot: (value: Snapshot) => void = () => undefined;
    jest
      .spyOn(nativeMock(), 'getSnapshot')
      .mockReturnValueOnce(new Promise((resolve) => (resolveSnapshot = resolve)));
    renderHook(() => useAirPodsAlerts(), { wrapper });
    await airPods(true);
    await act(async () => resolveSnapshot({ ...IDLE_SNAPSHOT, airPodsConnected: false }));
    await airPods(true);
    expect(dialogs()).toEqual([AIRPODS_CONNECTED.title]);
  });

  test('a failed snapshot just means no seed', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockRejectedValue(new Error('module gone'));
    renderHook(() => useAirPodsAlerts(), { wrapper });
    await act(async () => {});
    await airPods(true);
    expect(dialogs()).toEqual([AIRPODS_CONNECTED.title]);
  });

  test('nothing after unmount', async () => {
    const hook = await render();
    hook.unmount();
    await airPods(true);
    expect(dialogs()).toEqual([]);
  });
});

describe('useAirPodsAlerts: no-motion hint', () => {
  test('a session 10 s without AirPods shows the hint once', async () => {
    await render();
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS - 1);
    expect(dialogs()).toEqual([]);
    await advance(1);
    expect(alertSpy.mock.calls).toEqual([[NO_MOTION_HINT.title, NO_MOTION_HINT.message]]);
    await phase(PHASES.whisper);
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS * 3);
    expect(dialogs()).toEqual([NO_MOTION_HINT.title]);
  });

  test('no hint once they connect', async () => {
    await render();
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS / 2);
    await airPods(true);
    expect(jest.getTimerCount()).toBe(0);
    await advance(NO_MOTION_HINT_MS);
    expect(dialogs()).toEqual([AIRPODS_CONNECTED.title]);
  });

  test('no hint when the session stops first', async () => {
    await render();
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS / 2);
    await phase(PHASES.idle);
    expect(jest.getTimerCount()).toBe(0);
    await advance(NO_MOTION_HINT_MS);
    expect(dialogs()).toEqual([]);
  });

  test('no hint for a session that starts with them already connected', async () => {
    await render({ airPodsConnected: true });
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS * 2);
    expect(dialogs()).toEqual([]);
  });

  test('each new session can hint again', async () => {
    await render();
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS);
    await phase(PHASES.idle);
    await phase(PHASES.monitoring);
    await advance(NO_MOTION_HINT_MS);
    expect(dialogs()).toEqual([NO_MOTION_HINT.title, NO_MOTION_HINT.title]);
  });

  test('leaving mid-countdown clears the timer', async () => {
    const hook = await render();
    await phase(PHASES.monitoring);
    expect(jest.getTimerCount()).toBe(1);
    hook.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
