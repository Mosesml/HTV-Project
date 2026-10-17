const { withAppDelegate } = require('expo/config-plugins');

const START = '// @generated begin raveguard-noise-intents';
const END = '// @generated end raveguard-noise-intents';

function addNoiseIntentsPackage(contents) {
  const block = `${START}
import AppIntents
internal import RaveGuardNative

struct RaveGuardAppIntentsPackage: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] {
    [RaveGuardNoiseIntentsPackage.self]
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

module.exports = function withNoiseAutomation(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('RaveGuard noise intents require the Swift Expo AppDelegate');
    }
    mod.modResults.contents = addNoiseIntentsPackage(mod.modResults.contents);
    return mod;
  });
};

module.exports.addNoiseIntentsPackage = addNoiseIntentsPackage;
