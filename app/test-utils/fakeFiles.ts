import * as FileSystem from 'expo-file-system';

import type { Settings } from '../modules/raveguard-native';
import { SETTINGS_SCHEMA_VERSION } from '../src/settings/settingsStore';
import type { FakeFileSystemControls } from './fakeFileSystem';

/** The in-memory file system jest.setup.ts installs in place of `expo-file-system`. */
export function fakeFileSystem(): FakeFileSystemControls {
  return (FileSystem as unknown as { __controls: FakeFileSystemControls }).__controls;
}

/** Where the app keeps its settings in the fake file system. */
export const SETTINGS_URI = 'file:///fake/Documents/raveguard-settings.json';
export const SETTINGS_TEMP_URI = `${SETTINGS_URI}.tmp`;

/** Puts `settings` on "disk" the way the app saves them, as if saved before this launch. */
export function seedSavedSettings(settings: Settings, savedAt = 0): void {
  fakeFileSystem().seed(SETTINGS_URI, JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, savedAt, settings }));
}
