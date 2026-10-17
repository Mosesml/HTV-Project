import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { useFonts } from 'expo-font';

import { FONTS } from './theme';

// The app's fonts (docs/design/README.md, "Type"). Only the weights the design uses are
// imported, from each package's per-weight entry, so the bundle carries nine files rather
// than every weight. The keys are the family names TEXT in theme.ts refers to.

export const APP_FONTS = {
  [FONTS.soraMedium]: Sora_500Medium,
  [FONTS.soraSemiBold]: Sora_600SemiBold,
  [FONTS.soraBold]: Sora_700Bold,
  [FONTS.manropeRegular]: Manrope_400Regular,
  [FONTS.manropeMedium]: Manrope_500Medium,
  [FONTS.manropeSemiBold]: Manrope_600SemiBold,
  [FONTS.manropeBold]: Manrope_700Bold,
  [FONTS.monoMedium]: JetBrainsMono_500Medium,
  [FONTS.monoSemiBold]: JetBrainsMono_600SemiBold,
} as const;

/**
 * Loads every app font. `isReady` turns true once they are loaded, or once loading failed (the
 * app then falls back to the system font rather than staying on the splash screen).
 */
export function useAppFonts(): { isReady: boolean; error: Error | null } {
  const [isLoaded, error] = useFonts(APP_FONTS);
  return { isReady: isLoaded || error !== null, error };
}
