/** Shortcuts callbacks update Swift through the root layout; they are not screen routes. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const url = new URL(path);
    if (
      url.protocol === 'raveguard:' &&
      url.hostname === 'noise' &&
      ['/success', '/cancel', '/error'].includes(url.pathname)
    ) {
      // Keep the open check-in/session visible. On a cold launch, PhaseNavigator restores
      // the appropriate screen from Swift after the initial snapshot arrives.
      return initial ? '/' : null;
    }
  } catch {
    // Expo also passes ordinary route paths here.
  }
  return path;
}
