import { File, Paths } from 'expo-file-system';

// Where the settings file lives. The store (settingsStore.ts) only sees this small interface,
// so tests and previews can swap in memory storage.

export interface SettingsStorage {
  /** The saved text, or null when nothing has been saved. */
  read(): Promise<string | null>;
  /** Replaces the saved text. Either the old or the new text survives a crash, never half of one. */
  write(text: string): Promise<void>;
  /** Deletes the saved text; fine when there is none. */
  remove(): Promise<void>;
}

export const SETTINGS_FILE_NAME = 'raveguard-settings.json';
const TEMP_SUFFIX = '.tmp';

/**
 * A JSON file in the app's document directory (kept by iOS until the app is deleted, and
 * included in device backups). Writes go to a temp file first, which is then moved over the
 * real one; if the app dies between the two, the next read picks up the temp file.
 */
export function createFileSettingsStorage(fileName: string = SETTINGS_FILE_NAME): SettingsStorage {
  const mainFile = () => new File(Paths.document, fileName);
  const tempFile = () => new File(Paths.document, `${fileName}${TEMP_SUFFIX}`);

  return {
    async read() {
      const main = mainFile();
      if (main.exists) return main.text();
      const temp = tempFile();
      return temp.exists ? temp.text() : null;
    },
    async write(text) {
      const temp = tempFile();
      temp.write(text);
      temp.moveSync(mainFile(), { overwrite: true });
    },
    async remove() {
      [mainFile(), tempFile()].filter((file) => file.exists).forEach((file) => file.delete());
    },
  };
}

/** Keeps the text in memory only: for tests and previews. */
export function createMemorySettingsStorage(initial: string | null = null): SettingsStorage {
  let text = initial;
  return {
    async read() {
      return text;
    },
    async write(next) {
      text = next;
    },
    async remove() {
      text = null;
    },
  };
}
