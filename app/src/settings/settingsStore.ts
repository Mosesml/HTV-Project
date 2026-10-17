import * as RaveGuard from '../../modules/raveguard-native';
import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from './defaults';
import type { SettingsStorage } from './settingsStorage';
import { assertValidSettings, describeIssue, validateSettings } from './validateSettings';

// Settings storage (K4, PRD D4): load at launch, save after validating, and send through
// configure(). PINs are not here: they are salted hashes in expo-secure-store (K6).
//
// Loading never calls configure(). Swift keeps settings in memory, and configure() while a
// session is monitoring reschedules the next check-in, so a JavaScript reload mid-session must
// not resend them. They go down when they change (applySettings) and right before a session
// starts (the Setup screen).

/** Bump when the saved shape changes, and teach loadSettings to read the old one. */
export const SETTINGS_SCHEMA_VERSION = 1;

interface SavedSettingsFile {
  schemaVersion: number;
  /** Epoch ms. */
  savedAt: number;
  settings: unknown;
}

export interface LoadedSettings {
  settings: Settings;
  /** `defaults` on a fresh install, or when the saved file could not be used. */
  source: 'saved' | 'defaults';
  /** Epoch ms of the save that was loaded. */
  savedAt: number | null;
  /** Why the saved settings were not used, for the wearer to see. Null when nothing went wrong. */
  problem: string | null;
}

const FALLBACK = ', so the defaults are in use until you save again.';

function defaults(problem: string | null): LoadedSettings {
  return { settings: DEFAULT_SETTINGS, source: 'defaults', savedAt: null, problem };
}

function isSavedFile(value: unknown): value is SavedSettingsFile {
  return typeof value === 'object' && value !== null && 'schemaVersion' in value && 'settings' in value;
}

function parse(text: string): LoadedSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return defaults(`Saved settings are damaged${FALLBACK}`);
  }
  if (!isSavedFile(parsed)) return defaults(`Saved settings are damaged${FALLBACK}`);
  if (parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    return defaults(`Saved settings are from an unknown version (${String(parsed.schemaVersion)})${FALLBACK}`);
  }
  const result = validateSettings(parsed.settings);
  if (!result.ok) {
    return defaults(`Saved settings are not valid (${result.issues.map(describeIssue).join('; ')})${FALLBACK}`);
  }
  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : null;
  return { settings: result.settings, source: 'saved', savedAt, problem: null };
}

/**
 * What was saved, or the defaults. Never throws: a missing, damaged or unreadable file gives
 * the defaults plus a `problem`, and the file is left alone until the next save.
 */
export async function loadSettings(storage: SettingsStorage): Promise<LoadedSettings> {
  let text: string | null;
  try {
    text = await storage.read();
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return defaults(`Couldn't read saved settings (${reason}), so the defaults are in use.`);
  }
  return text === null ? defaults(null) : parse(text);
}

/**
 * Validates and saves. Throws SettingsValidationError (and writes nothing) when invalid.
 * Resolves to the clean copy that was saved. Does not call configure().
 */
export async function saveSettings(
  storage: SettingsStorage,
  candidate: Settings,
  now: number = Date.now()
): Promise<Settings> {
  const settings = assertValidSettings(candidate);
  const file: SavedSettingsFile = { schemaVersion: SETTINGS_SCHEMA_VERSION, savedAt: now, settings };
  await storage.write(JSON.stringify(file));
  return settings;
}

/**
 * Validates, saves, then sends the saved copy through configure(). Invalid settings reach
 * neither the file nor Swift; a failed write never calls configure(). If Swift refuses, the
 * error is passed on and the file is kept (validation mirrors Swift, so that means a bug).
 */
export async function applySettings(
  storage: SettingsStorage,
  candidate: Settings,
  now: number = Date.now()
): Promise<Settings> {
  const settings = await saveSettings(storage, candidate, now);
  await RaveGuard.configure(settings);
  return settings;
}

/** Deletes the saved settings; the next load gives the defaults. */
export async function clearSettings(storage: SettingsStorage): Promise<void> {
  await storage.remove();
}
