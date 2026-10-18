import type { ReactNode } from 'react';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

// Shared, short transitions for occasional setup changes. System Reduce Motion disables them.
export const SETTINGS_LAYOUT = LinearTransition.duration(180).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);
const ENTER = FadeInDown.duration(160).withInitialValues({ transform: [{ translateY: 6 }] }).reduceMotion(ReduceMotion.System);
const EXIT = FadeOut.duration(120).reduceMotion(ReduceMotion.System);
const REVEAL = FadeIn.duration(120).reduceMotion(ReduceMotion.System);

export function SettingsTransition({ children, isReveal = false }: { children: ReactNode; isReveal?: boolean }) {
  return (
    <Animated.View collapsable={false} entering={isReveal ? REVEAL : ENTER} exiting={isReveal ? undefined : EXIT} layout={SETTINGS_LAYOUT}>
      {children}
    </Animated.View>
  );
}
