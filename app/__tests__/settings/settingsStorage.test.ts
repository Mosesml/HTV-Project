import { createFileSettingsStorage, createMemorySettingsStorage } from '../../src/settings/settingsStorage';
import { fakeFileSystem, SETTINGS_TEMP_URI, SETTINGS_URI } from '../../test-utils/fakeFiles';

beforeEach(() => fakeFileSystem().reset());

describe('file settings storage (expo-file-system, document directory)', () => {
  test('reads null before anything was saved', async () => {
    await expect(createFileSettingsStorage().read()).resolves.toBeNull();
  });

  test('writes to raveguard-settings.json in the document directory and reads it back', async () => {
    const storage = createFileSettingsStorage();
    await storage.write('{"a":1}');
    expect(fakeFileSystem().files.get(SETTINGS_URI)).toBe('{"a":1}');
    await expect(storage.read()).resolves.toBe('{"a":1}');
  });

  test('a fresh storage object (a relaunch) reads what the last one wrote', async () => {
    await createFileSettingsStorage().write('saved before relaunch');
    await expect(createFileSettingsStorage().read()).resolves.toBe('saved before relaunch');
  });

  test('overwrites the previous file and leaves no temp file behind', async () => {
    const storage = createFileSettingsStorage();
    await storage.write('first');
    await storage.write('second');
    expect([...fakeFileSystem().files.keys()]).toEqual([SETTINGS_URI]);
    await expect(storage.read()).resolves.toBe('second');
  });

  test('a failed write leaves the previous file intact and rejects', async () => {
    const storage = createFileSettingsStorage();
    await storage.write('good');
    fakeFileSystem().failNextWrite(new Error('disk full'));
    await expect(storage.write('new')).rejects.toThrow('disk full');
    await expect(storage.read()).resolves.toBe('good');
  });

  test('recovers the temp file when the app died between writing it and moving it', async () => {
    fakeFileSystem().seed(SETTINGS_TEMP_URI, 'written just before the crash');
    await expect(createFileSettingsStorage().read()).resolves.toBe('written just before the crash');
  });

  test('prefers the main file over a stale temp file', async () => {
    fakeFileSystem().seed(SETTINGS_URI, 'main');
    fakeFileSystem().seed(SETTINGS_TEMP_URI, 'stale');
    await expect(createFileSettingsStorage().read()).resolves.toBe('main');
  });

  test('remove deletes both files, and is fine when there is nothing to delete', async () => {
    const storage = createFileSettingsStorage();
    await storage.remove();
    fakeFileSystem().seed(SETTINGS_URI, 'main');
    fakeFileSystem().seed(SETTINGS_TEMP_URI, 'temp');
    await storage.remove();
    expect(fakeFileSystem().files.size).toBe(0);
  });
});

describe('memory settings storage (for tests and previews)', () => {
  test('starts with what it was given, then round-trips', async () => {
    const storage = createMemorySettingsStorage('initial');
    await expect(storage.read()).resolves.toBe('initial');
    await storage.write('next');
    await expect(storage.read()).resolves.toBe('next');
    await storage.remove();
    await expect(storage.read()).resolves.toBeNull();
  });
});
