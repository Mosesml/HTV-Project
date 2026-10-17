// An in-memory stand-in for `expo-haptics` (K9). jest.setup.ts installs it for every app
// test; tests reach it with `fakeHaptics()` from test-utils/fakeHapticsControls.ts.

type Method = 'notificationAsync' | 'impactAsync' | 'selectionAsync';

export interface FakeHapticCall {
  method: Method;
  /** The feedback type or style passed, if any. */
  type: string | undefined;
}

export interface FakeHapticsControls {
  /** Every haptic played, in order. */
  readonly calls: readonly FakeHapticCall[];
  /** The next haptic rejects with this error (once), as a phone without haptics would. */
  failNext(error: Error): void;
  /** Forgets the calls and clears any armed failure. */
  reset(): void;
}

// The real enum values from expo-haptics.
const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' } as const;
const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' } as const;

let calls: FakeHapticCall[] = [];
let armedFailure: Error | null = null;

function play(method: Method, type: string | undefined): Promise<void> {
  calls = [...calls, { method, type }];
  if (armedFailure !== null) {
    const failure = armedFailure;
    armedFailure = null;
    return Promise.reject(failure);
  }
  return Promise.resolve();
}

const controls: FakeHapticsControls = {
  get calls() {
    return calls;
  },
  failNext(error) {
    armedFailure = error;
  },
  reset() {
    calls = [];
    armedFailure = null;
  },
};

export const fakeExpoHaptics = {
  __esModule: true,
  NotificationFeedbackType,
  ImpactFeedbackStyle,
  notificationAsync: (type: string = NotificationFeedbackType.Success) => play('notificationAsync', type),
  impactAsync: (style: string = ImpactFeedbackStyle.Medium) => play('impactAsync', style),
  selectionAsync: () => play('selectionAsync', undefined),
  __controls: controls,
};
