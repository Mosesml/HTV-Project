// An in-memory stand-in for the parts of `expo-secure-store` the PIN store uses (K6).
// jest.setup.ts installs it for every app test; tests reach it with `fakeSecureStore()` from
// test-utils/fakeSecureStoreControls.ts.

type Method = 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync';

export interface FakeSecureStoreOptions {
  keychainService?: string;
  keychainAccessible?: number;
}

export interface FakeSecureStoreCall {
  method: Method;
  key: string;
  options: FakeSecureStoreOptions | undefined;
}

export interface FakeSecureStoreControls {
  /** Every stored value by key. */
  readonly items: ReadonlyMap<string, string>;
  /** Every call, in order, with the options it passed (the fake keeps one keychain service). */
  readonly calls: readonly FakeSecureStoreCall[];
  /** Puts a value in place, e.g. one an earlier app version wrote. */
  seed(key: string, value: string): void;
  /** The next call to `method` rejects with this error (once). */
  failNext(method: Method, error: Error): void;
  /** Empties the store, forgets the calls and clears any armed failure. */
  reset(): void;
}

// Real values from expo-secure-store's iOS module, so tests can check which one is passed.
const ACCESSIBILITY = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
} as const;

const VALID_KEY = /^[\w.-]+$/;

let items = new Map<string, string>();
let calls: FakeSecureStoreCall[] = [];
let armedFailures = new Map<Method, Error>();

function begin(method: Method, key: string, options: FakeSecureStoreOptions | undefined): void {
  calls = [...calls, { method, key, options }];
  if (!VALID_KEY.test(key)) throw new Error(`Invalid key provided to SecureStore: '${key}'`);
  const failure = armedFailures.get(method);
  if (failure) {
    armedFailures = new Map([...armedFailures].filter(([armed]) => armed !== method));
    throw failure;
  }
}

const controls: FakeSecureStoreControls = {
  get items() {
    return items;
  },
  get calls() {
    return calls;
  },
  seed(key, value) {
    items = new Map(items).set(key, value);
  },
  failNext(method, error) {
    armedFailures = new Map(armedFailures).set(method, error);
  },
  reset() {
    items = new Map();
    calls = [];
    armedFailures = new Map();
  },
};

export const fakeExpoSecureStore = {
  __esModule: true,
  ...ACCESSIBILITY,
  async getItemAsync(key: string, options?: FakeSecureStoreOptions): Promise<string | null> {
    begin('getItemAsync', key, options);
    return items.get(key) ?? null;
  },
  async setItemAsync(key: string, value: string, options?: FakeSecureStoreOptions): Promise<void> {
    begin('setItemAsync', key, options);
    if (typeof value !== 'string') throw new Error('SecureStore only stores strings');
    items = new Map(items).set(key, value);
  },
  async deleteItemAsync(key: string, options?: FakeSecureStoreOptions): Promise<void> {
    begin('deleteItemAsync', key, options);
    const next = new Map(items);
    next.delete(key);
    items = next;
  },
  __controls: controls,
};
