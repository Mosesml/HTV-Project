const { withAppDelegate } = require('expo/config-plugins');

const START = '// @generated begin raveguard-noise-intents';
const END = '// @generated end raveguard-noise-intents';

function addNoiseIntentsPackage(contents) {
  const block = `${START}
import AppIntents
internal import RaveGuardNative

// Declare actions in the app target. A package-only catalog from the static Expo
// pod was rejected by linkd as aggregateMetadataIsEmpty despite successful builds.
struct BeginNoiseRelayIntent: AppIntent {
  static let title: LocalizedStringResource = "Begin RaveGuard Noise Relay"
  static let openAppWhenRun = false
  init() {}

  @MainActor
  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    .result(value: RaveGuardNoiseRelay.begin())
  }
}

struct NextNoiseCommandIntent: AppIntent {
  static let title: LocalizedStringResource = "Get RaveGuard Noise Command"
  static let openAppWhenRun = false
  @Parameter(title: "Relay") var relay: String
  init() {}

  @MainActor
  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    .result(value: try RaveGuardNoiseRelay.nextCommandJSON(relay: relay))
  }
}

struct AcknowledgeNoiseCommandIntent: AppIntent {
  static let title: LocalizedStringResource = "Confirm RaveGuard Noise Command"
  static let openAppWhenRun = false
  @Parameter(title: "Relay") var relay: String
  @Parameter(title: "Request") var request: String
  init() {}

  @MainActor
  func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
    .result(value: RaveGuardNoiseRelay.acknowledge(relay: relay, request: request))
  }
}

struct RaveGuardNoiseAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: BeginNoiseRelayIntent(),
      phrases: ["Begin a noise relay in \\(.applicationName)"],
      shortTitle: "Begin Noise Relay",
      systemImageName: "ear")
    AppShortcut(
      intent: NextNoiseCommandIntent(),
      phrases: ["Get a noise relay command in \\(.applicationName)"],
      shortTitle: "Get Noise Command",
      systemImageName: "arrow.triangle.2.circlepath")
    AppShortcut(
      intent: AcknowledgeNoiseCommandIntent(),
      phrases: ["Confirm a noise relay command in \\(.applicationName)"],
      shortTitle: "Confirm Noise Command",
      systemImageName: "checkmark.circle")
  }
}
${END}`;
  const start = contents.indexOf(START);
  if (start !== -1) {
    const end = contents.indexOf(END, start);
    if (end === -1) throw new Error('Incomplete RaveGuard noise intents generated block');
    return contents.slice(0, start) + block + contents.slice(end + END.length);
  }
  return contents.trimEnd() + '\n\n' + block + '\n';
}

function registerNoiseShortcutsAtLaunch(contents) {
  const call = 'RaveGuardNoiseAppShortcuts.updateAppShortcutParameters()';
  if (contents.includes(call)) return contents;
  const anchor = '    let delegate = ReactNativeDelegate()';
  if (!contents.includes(anchor)) {
    throw new Error('Cannot register RaveGuard noise actions: Expo launch anchor was not found');
  }
  return contents.replace(anchor, `    ${call}\n${anchor}`);
}

module.exports = function withNoiseAutomation(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('RaveGuard noise intents require the Swift Expo AppDelegate');
    }
    mod.modResults.contents = registerNoiseShortcutsAtLaunch(addNoiseIntentsPackage(mod.modResults.contents));
    return mod;
  });
};

module.exports.addNoiseIntentsPackage = addNoiseIntentsPackage;
module.exports.registerNoiseShortcutsAtLaunch = registerNoiseShortcutsAtLaunch;
