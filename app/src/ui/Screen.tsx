import { use, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PALETTE, screenPadding, SPACE } from './theme';

type Tone = 'default' | 'sos';

type Props = {
  children: ReactNode;
  /** Pinned under the content at the bottom of the screen (the mockups' flex-grow spacer). */
  footer?: ReactNode;
  /** `sos` is the SOS screen's own background. */
  tone?: Tone;
  /** False for screens that must fit without scrolling (Check-in, PIN gate). Default true. */
  scroll?: boolean;
  /** Gap between direct children, default 22. */
  gap?: number;
  /** Centres the content vertically (Cancelling…). */
  isCentered?: boolean;
  keyboardShouldPersistTaps?: 'always' | 'handled' | 'never';
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

const BACKGROUNDS: Record<Tone, string> = { default: PALETTE.bg, sos: PALETTE.sosBg };

/**
 * Every redesigned screen's frame: the dark background, the 56 / 24 / 32 padding made safe-area
 * aware, a light status bar, and an optional footer pinned to the bottom.
 */
export function Screen({
  children,
  footer,
  tone = 'default',
  scroll = true,
  gap = SPACE.xl,
  isCentered = false,
  keyboardShouldPersistTaps = 'handled',
  contentStyle,
  testID,
}: Props) {
  // Read the context directly so a component test without a SafeAreaProvider still renders.
  const insets = use(SafeAreaInsetsContext) ?? NO_INSETS;
  const padding = screenPadding(insets);
  const background = { backgroundColor: BACKGROUNDS[tone] };

  const body = (
    <>
      <View style={[styles.content, { gap }, isCentered && styles.centered, contentStyle]}>{children}</View>
      {footer !== undefined && <View style={[styles.footer, { gap: SPACE.md }]}>{footer}</View>}
    </>
  );

  return (
    <View style={[styles.root, background]} testID={testID}>
      <StatusBar style="light" />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, padding, { gap }]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          style={background}>
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.fixed, padding, { gap }]}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  fixed: { flex: 1 },
  content: { flexGrow: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  footer: { marginTop: 'auto' },
});
