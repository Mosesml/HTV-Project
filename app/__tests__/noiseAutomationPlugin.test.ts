/** @jest-environment node */
import { addNoiseIntentsPackage, registerNoiseShortcutsAtLaunch } from '../plugins/withNoiseAutomation';

test('prebuild declares all relay intents in the app target exactly once', () => {
  const source = 'import Expo\nclass AppDelegate {}\n';
  const once = addNoiseIntentsPackage(source);
  for (const name of ['BeginNoiseRelayIntent', 'NextNoiseCommandIntent', 'AcknowledgeNoiseCommandIntent']) {
    expect(once).toContain(`struct ${name}: AppIntent`);
  }
  expect(once).toContain('RaveGuardNoiseRelay.nextCommandJSON(relay: relay)');
  expect(once).not.toContain('AppIntentsPackage');
  expect(once).toContain(source.trim());
  expect(addNoiseIntentsPackage(once)).toBe(once);
});

test('registers the action catalog on launch without starting a relay or duplicating the call', () => {
  const source = 'class AppDelegate {\n  func launch() {\n    let delegate = ReactNativeDelegate()\n  }\n}\n';
  const result = registerNoiseShortcutsAtLaunch(source);
  const call = 'RaveGuardNoiseAppShortcuts.updateAppShortcutParameters()';
  expect(result.indexOf(call)).toBeLessThan(result.indexOf('let delegate = ReactNativeDelegate()'));
  expect(result).not.toContain('beginRelay()');
  expect(registerNoiseShortcutsAtLaunch(result)).toBe(result);
});

test('fails visibly when a changed Expo app delegate has no launch anchor', () => {
  expect(() => registerNoiseShortcutsAtLaunch('class AppDelegate {}')).toThrow(/launch anchor/);
});
