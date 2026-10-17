import { act, screen } from '@testing-library/react-native';

type FakeTimersConfig = NonNullable<Parameters<typeof jest.useFakeTimers>[0]>;

/** Fake timers that leave promises and microtasks real, so renderApp still settles. */
export const FAKE_TIMER_OPTIONS: FakeTimersConfig = { doNotFake: ['nextTick', 'queueMicrotask'] };

/**
 * Runs `body` with fake timers, then unmounts whatever it rendered before the real timers
 * come back. Any screen built on `Screen` mounts expo-status-bar, which schedules its updates
 * on setImmediate: if it mounted under fake timers and unmounts under real ones, the test file
 * never finishes tearing down.
 */
export async function withFakeTimers(body: () => Promise<void>): Promise<void> {
  jest.useFakeTimers(FAKE_TIMER_OPTIONS);
  try {
    await body();
  } finally {
    await act(async () => jest.runOnlyPendingTimers());
    act(() => screen.unmount());
    await act(async () => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  }
}
