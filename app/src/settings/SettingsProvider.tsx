import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from './defaults';
import { createFileSettingsStorage, type SettingsStorage } from './settingsStorage';
import { applySettings, clearSettings, loadSettings, type LoadedSettings } from './settingsStore';

// The wearer's settings for the whole app (K4): loaded once at launch from the settings file,
// saved (and sent through configure()) with `save`. Screens read them with useSettings().

export interface SettingsState extends LoadedSettings {
  /** False until the saved settings have been read; `settings` are the defaults until then. */
  isLoaded: boolean;
  /** Validates, saves and sends through configure(). Rejects with the reason; state is kept. */
  save(next: Settings): Promise<Settings>;
  /** Deletes the saved settings and sends the defaults through configure(). */
  reset(): Promise<void>;
}

const NOT_LOADED: LoadedSettings = { settings: DEFAULT_SETTINGS, source: 'defaults', savedAt: null, problem: null };

const SettingsContext = createContext<SettingsState | null>(null);

let appStorage: SettingsStorage | null = null;

/** The settings file the app uses, made on first use. */
function defaultStorage(): SettingsStorage {
  appStorage ??= createFileSettingsStorage();
  return appStorage;
}

type Props = {
  children: ReactNode;
  /** Defaults to the settings file in the document directory. */
  storage?: SettingsStorage;
};

export function SettingsProvider({ children, storage }: Props) {
  const store = storage ?? defaultStorage();
  const [loaded, setLoaded] = useState<LoadedSettings>(NOT_LOADED);
  const [isLoaded, setIsLoaded] = useState(false);
  // A save or reset that lands before the launch read finishes wins over it.
  const hasLocalChange = useRef(false);

  useEffect(() => {
    let isMounted = true;
    loadSettings(store).then((result) => {
      if (!isMounted) return;
      if (!hasLocalChange.current) setLoaded(result);
      setIsLoaded(true);
    });
    return () => {
      isMounted = false;
    };
  }, [store]);

  const save = async (next: Settings): Promise<Settings> => {
    const savedAt = Date.now();
    hasLocalChange.current = true;
    try {
      const saved = await applySettings(store, next, savedAt);
      setLoaded({ settings: saved, source: 'saved', savedAt, problem: null });
      return saved;
    } catch (error: unknown) {
      // The file may have been written before configure() failed: show what is on disk.
      setLoaded(await loadSettings(store));
      throw error;
    }
  };

  const reset = async (): Promise<void> => {
    await clearSettings(store);
    hasLocalChange.current = true;
    setLoaded(NOT_LOADED);
    await RaveGuard.configure(DEFAULT_SETTINGS);
  };

  const value: SettingsState = { ...loaded, isLoaded, save, reset };
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsState {
  const value = use(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
