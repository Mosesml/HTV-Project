import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_PERMISSIONS, DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { addRecipient } from '../../src/settings/recipients';
import { createFileSettingsStorage, createMemorySettingsStorage } from '../../src/settings/settingsStorage';
import {
  applySettings,
  clearSettings,
  loadSettings,
  saveSettings,
  SETTINGS_SCHEMA_VERSION,
} from '../../src/settings/settingsStore';
import { SettingsValidationError } from '../../src/settings/validateSettings';
import { fakeFileSystem, SETTINGS_URI } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock } from '../../test-utils/nativeMock';

const SAVED_AT = 1_760_000_000_000;

const ALEX: Settings = addRecipient(
  {
    ...DEFAULT_SETTINGS,
    wearerName: 'Alex',
    selfDescription: 'black hoodie, white cap',
    intervalMin: 60,
    loudnessTarget: 90,
    demo: false,
    teammatePhone: '+14165550100',
    bridgeUrl: 'http://192.168.1.20:8080',
  },
  { name: 'Sam', phone: '+14165550101', kind: 'contact', permissions: { seeLocation: true } }
);

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});

describe('loadSettings', () => {
  test('a fresh install gets the defaults, with no problem to report', async () => {
    const loaded = await loadSettings(createMemorySettingsStorage());
    expect(loaded).toEqual({
      settings: DEFAULT_SETTINGS,
      source: 'defaults',
      savedAt: null,
      problem: null,
    });
    expect(loaded.settings.demo).toBe(true);
  });

  test('settings survive a relaunch: saved with one storage, loaded with a fresh one', async () => {
    await saveSettings(createFileSettingsStorage(), ALEX, SAVED_AT);
    await expect(loadSettings(createFileSettingsStorage())).resolves.toEqual({
      settings: ALEX,
      source: 'saved',
      savedAt: SAVED_AT,
      problem: null,
    });
  });

  test.each([1, 2])('version %i installs start on demo timings once, keeping their setup', async (version) => {
    const oldRealSettings = { ...ALEX, wearerName: 'Existing wearer', demo: false };
    const storage = createMemorySettingsStorage(
      JSON.stringify({ schemaVersion: version, savedAt: SAVED_AT, settings: oldRealSettings })
    );
    await expect(loadSettings(storage)).resolves.toEqual({
      settings: { ...oldRealSettings, demo: true },
      source: 'saved',
      savedAt: SAVED_AT,
      problem: null,
    });
  });

  test('after that, a saved choice of real timings is kept', async () => {
    await saveSettings(createFileSettingsStorage(), { ...ALEX, demo: false }, SAVED_AT);
    const loaded = await loadSettings(createFileSettingsStorage());
    expect(loaded.settings.demo).toBe(false);
  });

  test.each([1, 2, 3])('version %i contacts migrate to shared defaults without changing their identity', async (schemaVersion) => {
    const oldSettings = {
      ...ALEX,
      recipients: ALEX.recipients.map((recipient) => ({
        ...recipient,
        permissions: { receiveAlerts: false, seeLocation: false, seeFullBrief: false, canResolve: true },
      })),
    };
    const storage = createMemorySettingsStorage(JSON.stringify({ schemaVersion, savedAt: SAVED_AT, settings: oldSettings }));
    const loaded = await loadSettings(storage);
    expect(loaded.settings.recipients).toEqual(ALEX.recipients.map((recipient) => ({ ...recipient, permissions: DEFAULT_PERMISSIONS })));
    expect(loaded.settings.demo).toBe(schemaVersion < 3);
    expect(loaded.savedAt).toBe(SAVED_AT);
  });

  test('a damaged file falls back to the defaults and says so, without deleting the file', async () => {
    fakeFileSystem().seed(SETTINGS_URI, '{"schemaVersion":1,"sett');
    const loaded = await loadSettings(createFileSettingsStorage());
    expect(loaded).toMatchObject({ settings: DEFAULT_SETTINGS, source: 'defaults' });
    expect(loaded.problem).toBe('Saved settings are damaged, so the defaults are in use until you save again.');
    expect(fakeFileSystem().files.has(SETTINGS_URI)).toBe(true);
  });

  test('a file from an unknown version falls back to the defaults and names the version', async () => {
    const storage = createMemorySettingsStorage(JSON.stringify({ schemaVersion: 99, savedAt: 1, settings: ALEX }));
    const loaded = await loadSettings(storage);
    expect(loaded.source).toBe('defaults');
    expect(loaded.problem).toBe(
      'Saved settings are from an unknown version (99), so the defaults are in use until you save again.'
    );
  });

  test('a file whose settings fail validation falls back to the defaults and says why', async () => {
    const bad = { ...ALEX, intervalMin: 45 };
    const storage = createMemorySettingsStorage(
      JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, savedAt: 1, settings: bad })
    );
    const loaded = await loadSettings(storage);
    expect(loaded.source).toBe('defaults');
    expect(loaded.problem).toBe(
      'Saved settings are not valid (intervalMin must be 30 or 60 (got 45)), so the defaults are in use until you save again.'
    );
  });

  test('a read that fails falls back to the defaults and passes on the reason', async () => {
    const storage = { ...createMemorySettingsStorage(), read: () => Promise.reject(new Error('no access')) };
    const loaded = await loadSettings(storage);
    expect(loaded.source).toBe('defaults');
    expect(loaded.problem).toBe("Couldn't read saved settings (no access), so the defaults are in use.");
  });

  test('loading never calls configure(): a relaunch must not reschedule a running session', async () => {
    await saveSettings(createFileSettingsStorage(), ALEX, SAVED_AT);
    await loadSettings(createFileSettingsStorage());
    expect(calledMethods()).toEqual([]);
  });
});

describe('saveSettings', () => {
  test('writes a versioned envelope holding exactly the Settings fields', async () => {
    await saveSettings(createFileSettingsStorage(), { ...ALEX, extra: 'dropped' } as Settings, SAVED_AT);
    const written = JSON.parse(fakeFileSystem().files.get(SETTINGS_URI) ?? 'null');
    expect(written).toEqual({ schemaVersion: SETTINGS_SCHEMA_VERSION, savedAt: SAVED_AT, settings: ALEX });
  });

  test('refuses invalid settings with a SettingsValidationError and writes nothing', async () => {
    const storage = createFileSettingsStorage();
    await expect(saveSettings(storage, { ...ALEX, wearerName: ' ' })).rejects.toBeInstanceOf(
      SettingsValidationError
    );
    await expect(saveSettings(storage, { ...ALEX, wearerName: ' ' })).rejects.toThrow(
      'Settings not saved: wearerName must not be blank'
    );
    expect(fakeFileSystem().files.size).toBe(0);
  });

  test('does not call configure() on its own', async () => {
    await saveSettings(createFileSettingsStorage(), ALEX);
    expect(calledMethods()).toEqual([]);
  });
});

describe('applySettings: validate, save, then send through configure()', () => {
  test('saves and calls configure() once with exactly the saved settings', async () => {
    const applied = await applySettings(createFileSettingsStorage(), ALEX, SAVED_AT);
    expect(applied).toEqual(ALEX);
    expect(nativeMock().calls).toEqual([{ method: 'configure', args: [ALEX] }]);
    const loaded = await loadSettings(createFileSettingsStorage());
    expect(loaded.settings).toEqual(ALEX);
  });

  test('invalid settings reach neither the file nor Swift', async () => {
    await expect(applySettings(createFileSettingsStorage(), { ...ALEX, loudnessTarget: 200 })).rejects.toThrow(
      'loudnessTarget must be between 0 and 120 dB (got 200)'
    );
    expect(calledMethods()).toEqual([]);
    expect(fakeFileSystem().files.size).toBe(0);
  });

  test('a failed write does not call configure()', async () => {
    fakeFileSystem().failNextWrite(new Error('disk full'));
    await expect(applySettings(createFileSettingsStorage(), ALEX)).rejects.toThrow('disk full');
    expect(calledMethods()).toEqual([]);
  });

  test('when Swift refuses, the error comes back and the saved file is kept', async () => {
    jest.spyOn(nativeMock(), 'configure').mockRejectedValueOnce(new Error('settings.demo: must be a boolean'));
    await expect(applySettings(createFileSettingsStorage(), ALEX)).rejects.toThrow('settings.demo: must be a boolean');
    expect(fakeFileSystem().files.has(SETTINGS_URI)).toBe(true);
  });
});

describe('clearSettings', () => {
  test('removes the saved file so the next load is the defaults', async () => {
    const storage = createFileSettingsStorage();
    await saveSettings(storage, ALEX);
    await clearSettings(storage);
    await expect(loadSettings(storage)).resolves.toMatchObject({ settings: DEFAULT_SETTINGS, source: 'defaults' });
  });
});
