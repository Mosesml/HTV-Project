import { act, renderHook } from '@testing-library/react-native';

import { CANCEL_HAPTIC, CANCELLING_MS, type CancelKind } from '../../src/pin/cancelSequence';
import { useCancelSequence } from '../../src/pin/useCancelSequence';
import { fakeHaptics } from '../../test-utils/fakeHapticsControls';
import { nativeMock } from '../../test-utils/nativeMock';

beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterAll(() => jest.useRealTimers());
afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  nativeMock().reset();
  fakeHaptics().reset();
});

function pinResults(): unknown[] {
  return nativeMock()
    .calls.filter((call) => call.method === 'pinResult')
    .map((call) => call.args[0]);
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The step, the haptics played and the time, every millisecond from the start to 100 ms after the end. */
async function recordSequence(kind: CancelKind) {
  nativeMock().reset();
  fakeHaptics().reset();
  const hook = renderHook(() => useCancelSequence());
  const before = hook.result.current.step;
  act(() => hook.result.current.startCancel(kind));
  const steps: string[] = [];
  for (let ms = 0; ms <= CANCELLING_MS + 100; ms += 1) {
    steps.push(hook.result.current.step);
    await advance(1);
  }
  const haptics = fakeHaptics().calls;
  hook.unmount();
  return { before, steps, haptics };
}

describe('useCancelSequence', () => {
  test('waits for a correct PIN before doing anything', () => {
    const hook = renderHook(() => useCancelSequence());
    expect(hook.result.current.step).toBe('entering');
    expect(fakeHaptics().calls).toEqual([]);
    expect(pinResults()).toEqual([]);
  });

  test('shows "Cancelling…" for exactly 600 ms, then "Cancelled"', async () => {
    expect(CANCELLING_MS).toBe(600);
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('safe'));
    expect(hook.result.current.step).toBe('cancelling');
    await advance(CANCELLING_MS - 1);
    expect(hook.result.current.step).toBe('cancelling');
    await advance(1);
    expect(hook.result.current.step).toBe('cancelled');
  });

  test('plays one success haptic as "Cancelling…" appears', () => {
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('duress'));
    expect(fakeHaptics().calls).toEqual([{ method: 'notificationAsync', type: CANCEL_HAPTIC }]);
    expect(CANCEL_HAPTIC).toBe('success');
  });

  test('sends pinResult with the kind straight away', () => {
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('duress'));
    expect(pinResults()).toEqual(['duress']);
  });

  test('duress rule: safe and duress give the same steps at the same milliseconds and the same haptic', async () => {
    const safe = await recordSequence('safe');
    const duress = await recordSequence('duress');
    expect(duress).toEqual(safe);
    expect(safe.steps.indexOf('cancelled')).toBe(CANCELLING_MS);
  });

  test('does not wait for pinResult: one that never answers still reaches "Cancelled" on time', async () => {
    jest.spyOn(nativeMock(), 'pinResult').mockReturnValue(new Promise<void>(() => {}));
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('safe'));
    await advance(CANCELLING_MS);
    expect(hook.result.current.step).toBe('cancelled');
  });

  test('a pinResult that fails changes nothing', async () => {
    jest.spyOn(nativeMock(), 'pinResult').mockRejectedValue(new Error('module gone'));
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('duress'));
    await advance(CANCELLING_MS);
    expect(hook.result.current.step).toBe('cancelled');
  });

  test('a phone without haptics changes nothing', async () => {
    fakeHaptics().failNext(new Error('haptics unavailable'));
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('safe'));
    expect(hook.result.current.step).toBe('cancelling');
    await advance(CANCELLING_MS);
    expect(hook.result.current.step).toBe('cancelled');
  });

  test('a second correct PIN during the sequence is ignored and does not restart the 600 ms', async () => {
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('safe'));
    await advance(300);
    act(() => hook.result.current.startCancel('duress'));
    await advance(CANCELLING_MS - 300);
    expect(hook.result.current.step).toBe('cancelled');
    expect(pinResults()).toEqual(['safe']);
    expect(fakeHaptics().calls).toHaveLength(1);
  });

  test('leaving the screen mid-sequence clears the timer', async () => {
    const hook = renderHook(() => useCancelSequence());
    act(() => hook.result.current.startCancel('safe'));
    expect(jest.getTimerCount()).toBe(1);
    hook.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
