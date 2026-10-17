import { nodeFs, nodePath } from '../../test-utils/nodeFiles';

// PRD DEM-1 / the brief: RaveGuard never dials emergency services; the demo SOS rings a
// teammate. This scans the app's own code (screens, settings, the native module's JavaScript
// and Swift, the app config) for an emergency number, and checks the only `tel:` URL is the
// teammate call. Tests are not scanned: they hold the numbers to look for. The Swift side has
// the same scan in SessionWiringTests.swift.

// Jest provides __dirname; the app has no @types/node to declare it.
declare const __dirname: string;

const { readdirSync, readFileSync, statSync } = nodeFs;
const { join, relative } = nodePath;
const APP_DIR = join(__dirname, '..', '..');
const SCANNED_DIRS = ['src', 'modules/raveguard-native'];
const SCANNED_FILES = ['app.json', 'app.config.ts'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.swift'];
const SKIPPED_DIRS = new Set(['node_modules', '.build', 'Tests', 'Fixtures', 'coverage']);
/** The one file allowed to build a `tel:` URL. */
const TEL_FILE = 'src/alert/teammateCall.ts';

/** 911 (North America), 112 (EU and GSM phones), 999 (UK), 000 (Australia). */
const EMERGENCY_NUMBER = /(?<![0-9A-Za-z_.#])(911|112|999|000)(?![0-9A-Za-z_.])/;
const TEL_URL = /\btel:/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

function appFiles(): string[] {
  return [
    ...SCANNED_DIRS.flatMap((dir) => sourceFiles(join(APP_DIR, dir))),
    ...SCANNED_FILES.map((file) => join(APP_DIR, file)),
  ];
}

function linesMatching(pattern: RegExp, files: string[]): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => (pattern.test(line) ? [`${relative(APP_DIR, file)}:${index + 1}: ${line.trim()}`] : []))
  );
}

describe('no emergency number in the app code (DEM-1)', () => {
  test('the pattern catches emergency numbers and ignores ordinary ones', () => {
    const caught = ["Linking.openURL('tel:911')", "const SOS = '112';", 'dial(999)', '"000"', '+911'];
    const ignored = ["'#000'", '1_800_000_000_000', '0.999', "'+14165550199'", 'level 100', 'rgb000a', '9110'];
    expect(caught.filter((line) => !EMERGENCY_NUMBER.test(line))).toEqual([]);
    expect(ignored.filter((line) => EMERGENCY_NUMBER.test(line))).toEqual([]);
  });

  test('scans the screens, the native module and the config', () => {
    const scanned = appFiles().map((file) => relative(APP_DIR, file));
    expect(scanned).toEqual(
      expect.arrayContaining([
        TEL_FILE,
        'src/screens/AlertScreen.tsx',
        'modules/raveguard-native/index.ts',
        'modules/raveguard-native/ios/Session/SessionManagerConfig.swift',
        'app.json',
      ])
    );
    expect(scanned.some((file) => file.includes('/Tests/'))).toBe(false);
  });

  test('no file holds an emergency number', () => {
    expect(linesMatching(EMERGENCY_NUMBER, appFiles())).toEqual([]);
  });

  test('the teammate call is the only tel: URL', () => {
    const others = appFiles().filter((file) => relative(APP_DIR, file) !== TEL_FILE);
    expect(linesMatching(TEL_URL, others)).toEqual([]);
    expect(readFileSync(join(APP_DIR, TEL_FILE), 'utf8')).toMatch(TEL_URL);
  });
});
