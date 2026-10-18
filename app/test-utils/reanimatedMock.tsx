import type { ReactNode } from 'react';
import { View } from 'react-native';

// Route tests exercise the actual setup tree; layout frames need the native runtime.
// Expo Router imports this mock path too, so keep its test wrapper consistent with ours.
class Transition {
  duration() { return this; }
  easing() { return this; }
  reduceMotion() { return this; }
  withInitialValues() { return this; }
}

export const LinearTransition = new Transition();
export const FadeInDown = new Transition();
export const FadeIn = new Transition();
export const FadeOut = new Transition();
export const ReduceMotion = { System: 'system' };
export const Easing = { cubic: () => 0, out: (curve: unknown) => curve };
export function LayoutAnimationConfig({ children }: { children: ReactNode }) { return children; }
export default { View };
