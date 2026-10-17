import * as Haptics from 'expo-haptics';

import type { FakeHapticsControls } from './fakeHaptics';

/** The haptics stand-in jest.setup.ts installs in place of `expo-haptics`. */
export function fakeHaptics(): FakeHapticsControls {
  return (Haptics as unknown as { __controls: FakeHapticsControls }).__controls;
}
