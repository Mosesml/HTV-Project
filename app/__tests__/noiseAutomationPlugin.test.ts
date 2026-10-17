/** @jest-environment node */
import { addNoiseIntentsPackage } from '../plugins/withNoiseAutomation';

test('prebuild includes framework intents in the app exactly once', () => {
  const source = 'import Expo\nclass AppDelegate {}\n';
  const once = addNoiseIntentsPackage(source);
  expect(once).toContain('RaveGuardNoiseIntentsPackage.self');
  expect(once).toContain(source.trim());
  expect(addNoiseIntentsPackage(once)).toBe(once);
});
